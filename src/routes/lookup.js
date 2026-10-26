import { Router } from "express";
import { pool } from "../config/db.js";

const router = Router();

const clean = (value) => String(value ?? "").trim().toUpperCase().slice(0, 50);

// GET /api/lookup?bin=&pcn=&group=
// Reads only BIN, PCN, Group, PBM, and payer type, so no dollar figures can leak.
router.get("/", async (req, res) => {
  const bin = clean(req.query.bin);
  const pcn = clean(req.query.pcn);
  const group = clean(req.query.group);
  if (!bin && !pcn && !group) {
    return res.status(400).json({ error: "Enter at least one of BIN, PCN, or Group" });
  }

  const conditions = [];
  const params = [];
  if (bin) {
    // master_sheet stores BINs without leading zeros (4336), while cards print them (004336).
    params.push(bin.replace(/^0+(?=.)/, ""));
    conditions.push(`ltrim(upper(trim(bin)), '0') = ltrim($${params.length}, '0')`);
  }
  if (pcn) {
    params.push(pcn);
    conditions.push(`upper(trim(pcn)) = $${params.length}`);
  }
  if (group) {
    params.push(group);
    conditions.push(`upper(trim(grp)) = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT bin, pcn, grp, pbm_name, payer_type
     FROM master_sheet
     WHERE ${conditions.join(" AND ")}
     ORDER BY pbm_name, bin, pcn, grp
     LIMIT 50`,
    params
  );

  res.json({
    items: rows.map((r) => ({
      bin: r.bin,
      pcn: r.pcn,
      group: r.grp,
      pbmName: r.pbm_name,
      payerType: r.payer_type,
    })),
  });
});

export default router;
