import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireMember, requireProfile } from "../middleware/auth.js";

const router = Router();

const ALLOWED_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Store file in memory so we can stream it to S3.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error("Only jpeg, png, webp, or gif images are allowed."));
  },
});

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

// POST /api/upload/image  — multipart/form-data, field name: "image"
// Returns { url } — the public S3 URL to store with the thread.
router.post("/image", requireMember, requireProfile, (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Image must be 5 MB or smaller." });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return res.status(500).json({ error: "Image uploads are not configured." });

  const ext = ALLOWED_TYPES[req.file.mimetype] ?? "jpg";
  const key = `forum/images/${randomUUID()}.${ext}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }),
    );
  } catch (err) {
    console.error("S3 upload error:", err);
    return res.status(500).json({ error: "Image upload failed. Please try again." });
  }

  const cdnBase = process.env.AWS_CLOUDFRONT_URL;
  const url = cdnBase
    ? `${cdnBase.replace(/\/+$/, "")}/${key}`
    : `https://${bucket}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${key}`;

  res.json({ url });
});

export default router;
