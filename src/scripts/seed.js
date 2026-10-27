// Seeds categories, four test authors, and the twelve demo threads with their comments.
// The thread and comment text is copied verbatim from forum-frontend/lib/mock.ts (build plan v2).
// Safe to run twice: categories and authors are upserted, and the seed authors'
// threads are replaced on every run (their comments go with them by cascade).
import "dotenv/config";
import { pool } from "../config/db.js";

// The seed adds test rows to the shared users and pharmacy_details tables, which AuditProRx
// would then show as real accounts. Never run it against production by accident.
if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
  console.error("Refusing to seed with NODE_ENV=production. Set ALLOW_SEED=true if you really mean it.");
  process.exit(1);
}

const CATEGORIES = [
  { slug: "pbm-audits", name: "PBM Audits", description: "Desk audits, on-site audits, appeals, recoupments, and dealing with specific PBMs." },
  { slug: "claims-and-rejections", name: "Claims and Rejections", description: "Rejected claims, reject codes, BIN and PCN questions, prior auths, and billing fixes." },
  { slug: "inventory-and-wholesalers", name: "Inventory and Wholesalers", description: "Invoices, shortages, reconciliation, and wholesaler accounts." },
  { slug: "compliance-and-licensing", name: "Compliance and Licensing", description: "DEA, state license renewals, CMEA, temperature logs, inspections, and record keeping." },
  { slug: "general-discussion", name: "General Discussion", description: "Everything else about running a pharmacy." },
  { slug: "announcements", name: "Announcements", description: "News from AuditProRx.", membersOnly: true, adminPostOnly: true },
];

// Test users only. No password and status inactive, so they cannot sign in to AuditProRx.
// `pharmacy: true` adds a pharmacy_details row, which shows the Verified Pharmacy tag.
const AUTHORS = [
  { username: "rxowner_nj", role: "owner", pharmacy: true },
  { username: "techlife22", role: "technician" },
  { username: "pharmd_ohio", role: "pharmacist", pharmacy: true },
  { username: "consult_mike", role: "consultant" },
];

const THREADS = [
  {
    category: "pbm-audits",
    author: "rxowner_nj",
    imageUrl: "/mock/audit-letter.svg",
    title: "Caremark desk audit asking for 2023 invoices, what do they actually accept?",
    body: "<p>Got a desk audit letter from Caremark covering 40 claims from 2023. They want purchase records for every NDC on the list.</p><p>We buy from McKesson and a secondary. Is a wholesaler invoice summary enough, or do they want the line-item invoice for each date? Trying not to send more than they need.</p>",
    isPinned: true,
    viewCount: 212,
    likeCount: 9,
    createdAt: "2026-10-19T09:30:00Z",
    comments: [
      { author: "consult_mike", body: "<p>Line-item invoices, always. A summary gets kicked back and you lose two weeks. Pull the invoice-to-dispense report for the audit window and attach the invoices it references.</p>", likeCount: 6, createdAt: "2026-10-19T11:10:00Z" },
      { author: "pharmd_ohio", body: "<p>Same experience here. Also include the secondary wholesaler's DEA and license on the cover page or they question the source.</p>", likeCount: 3, createdAt: "2026-10-20T08:45:00Z" },
      { author: "rxowner_nj", body: "<p>Thanks both. Sending line items with a cover sheet this week.</p>", likeCount: 1, createdAt: "2026-10-22T14:02:00Z" },
    ],
  },
  {
    category: "claims-and-rejections",
    author: "techlife22",
    imageUrl: "/mock/rejection.svg",
    title: "BIN 610014 rejecting with 75 Prior Auth on a refill that went through last month",
    body: "<p>Patient's Eliquis refill rejected today with 75 Prior Authorization Required. Same BIN, same PCN, same group as the fill on September 20 which paid fine.</p><p>Nothing changed on our end. Plan year rollover maybe? Anyone seeing this on Express Scripts Medicare plans this month?</p>",
    viewCount: 98,
    likeCount: 3,
    createdAt: "2026-10-22T10:05:00Z",
    comments: [
      { author: "pharmd_ohio", body: "<p>Seeing it too. Formulary tier change on October 1 for a few DOACs. Call the help desk, they can backdate the PA if the patient was already stable on it.</p>", likeCount: 4, createdAt: "2026-10-22T10:40:00Z" },
      { author: "techlife22", body: "<p>Called, they confirmed the tier change. PA submitted through CoverMyMeds, waiting.</p>", likeCount: 0, createdAt: "2026-10-22T11:30:00Z" },
    ],
  },
  {
    category: "inventory-and-wholesalers",
    author: "pharmd_ohio",
    imageUrl: "/mock/invoice.svg",
    title: "McKesson invoice shows 3 bottles, we received 2. How do you document the short?",
    body: "<p>Tote arrived sealed, packing slip says 3 bottles of metformin 500 #500, only 2 in the tote. Called and they issued a credit, but what are you keeping on file so it does not look like a dispensing gap during an audit?</p>",
    viewCount: 41,
    likeCount: 2,
    createdAt: "2026-10-21T16:20:00Z",
    comments: [],
  },
  {
    category: "compliance-and-licensing",
    author: "consult_mike",
    title: "DEA renewal timeline: how early are you submitting now?",
    body: "<p>Renewals used to clear in two weeks. Two of my clients waited six weeks this summer and one had a gap. Are people submitting at 90 days now, or earlier?</p>",
    viewCount: 77,
    likeCount: 5,
    createdAt: "2026-10-18T13:00:00Z",
    comments: [
      { author: "rxowner_nj", body: "<p>We submit the day the 90-day window opens and keep the confirmation email printed next to the certificate. Had no issues since.</p>", likeCount: 2, createdAt: "2026-10-21T09:15:00Z" },
    ],
  },
  {
    category: "general-discussion",
    author: "rxowner_nj",
    title: "Anyone switched from PrimeRx to PioneerRx this year? Honest take?",
    body: "<p>Thinking about it for 2027. Main pain points today are reporting and the workflow queue. Would like to hear from stores that actually made the move, not sales reps.</p>",
    viewCount: 160,
    likeCount: 7,
    createdAt: "2026-10-17T18:40:00Z",
    comments: [
      { author: "techlife22", body: "<p>Switched in March. Queue is much better. Data migration took three weekends and we lost some old notes. Would still do it again.</p>", likeCount: 5, createdAt: "2026-10-18T07:30:00Z" },
      { author: "pharmd_ohio", body: "<p>Reporting is the big win. Budget a month of double-checking inventory counts after cutover.</p>", likeCount: 3, createdAt: "2026-10-20T20:05:00Z" },
    ],
  },
  {
    category: "pbm-audits",
    author: "pharmd_ohio",
    title: "Express Scripts recouped on a quantity exceeds days supply flag for an inhaler",
    body: "<p>Symbicort, 1 inhaler, billed as 30 days. ESI says the labeled dose makes it a 60-day supply and recouped the full claim. We appealed with the prescriber's sig. Anyone won this one?</p>",
    viewCount: 134,
    likeCount: 12,
    createdAt: "2026-10-16T15:10:00Z",
    comments: [
      { author: "consult_mike", body: "<p>Yes, twice. Attach the sig, the manufacturer's actuation count, and the math. Days supply has to match the prescriber's directions, not the label.</p>", likeCount: 8, createdAt: "2026-10-17T09:00:00Z" },
      { author: "rxowner_nj", body: "<p>Also check the fill history. If earlier fills were 30 days with the same sig they usually reverse.</p>", likeCount: 2, createdAt: "2026-10-20T12:50:00Z" },
    ],
  },
  {
    category: "claims-and-rejections",
    author: "consult_mike",
    title: "Reject 79 Refill Too Soon on a vacation override, which codes are you using?",
    body: "<p>Patient leaving the country for six weeks. Plan allows one vacation override per year but the claim keeps rejecting with 79. What submission clarification and prior auth type codes are working for you?</p>",
    viewCount: 58,
    likeCount: 1,
    createdAt: "2026-10-20T08:20:00Z",
    comments: [
      { author: "techlife22", body: "<p>Submission clarification code 03 with PA type 01 and the override number from the help desk in the PA field. Different PBMs want different fields, so call first.</p>", likeCount: 3, createdAt: "2026-10-20T10:00:00Z" },
    ],
  },
  {
    category: "inventory-and-wholesalers",
    author: "techlife22",
    title: "Anda vs Kinray for generics this quarter, pricing moved a lot",
    body: "<p>Our secondary pricing on common generics jumped about 8% in October. Is anyone seeing Anda come in lower right now, or is it the same across the board?</p>",
    viewCount: 23,
    likeCount: 0,
    createdAt: "2026-10-19T19:45:00Z",
    comments: [],
  },
  {
    category: "compliance-and-licensing",
    author: "rxowner_nj",
    title: "Temperature log gaps during the power outage, what did your inspector want to see?",
    body: "<p>Lost power for nine hours last week. Fridge stayed in range on the data logger but the manual log has a gap. Inspection is due. What did your inspector accept as documentation?</p>",
    viewCount: 88,
    likeCount: 4,
    createdAt: "2026-10-15T12:30:00Z",
    comments: [
      { author: "pharmd_ohio", body: "<p>A printed data logger export for the window plus a short signed incident note was enough for ours. They mostly wanted to see that you noticed and checked the stock.</p>", likeCount: 4, createdAt: "2026-10-18T16:00:00Z" },
    ],
  },
  {
    category: "general-discussion",
    author: "techlife22",
    title: "Tech-to-pharmacist ratio question for a busy independent store",
    body: "<p>We are at 350 scripts a day with one pharmacist and three techs. Owner wants to add a fourth tech. Does the state ratio count the cashier who also does data entry?</p>",
    viewCount: 44,
    likeCount: 1,
    createdAt: "2026-10-14T14:00:00Z",
    comments: [
      { author: "consult_mike", body: "<p>Depends on the state. In most, anyone touching the prescription record counts. Check your board's definition of technician duties before you add the fourth.</p>", likeCount: 2, createdAt: "2026-10-16T09:20:00Z" },
    ],
  },
  {
    category: "pbm-audits",
    author: "consult_mike",
    title: "Optum on-site audit checklist, sharing what they pulled at our store",
    body: "<p>Had an Optum on-site last month. Posting the list so others can prep.</p><ul><li>Purchase invoices for 25 NDCs, 12 months back</li><li>Signature logs for 30 claims</li><li>Pharmacist license and DEA on the wall</li><li>Compound logs for two claims</li><li>Proof of delivery for every delivered claim in the sample</li></ul><p>Delivery proof was the one that hurt. Make sure your driver app exports by claim.</p>",
    viewCount: 201,
    likeCount: 15,
    createdAt: "2026-10-12T10:00:00Z",
    comments: [
      { author: "rxowner_nj", body: "<p>This is gold. Bookmarking for our next one.</p>", likeCount: 3, createdAt: "2026-10-12T15:25:00Z" },
      { author: "pharmd_ohio", body: "<p>Can confirm the delivery proof piece. They disallowed four claims for us because the signature was a scribble with no date.</p>", likeCount: 5, createdAt: "2026-10-20T07:40:00Z" },
    ],
  },
  {
    category: "claims-and-rejections",
    author: "pharmd_ohio",
    title: "Medicaid secondary paying $0 after Part D primary, is this a COB setup issue?",
    body: "<p>Dual eligible patient. Part D pays, then the Medicaid secondary returns paid $0 with no reject. Patient copay should be covered. Is this an other coverage code problem on our side or something the state has to fix?</p>",
    viewCount: 31,
    likeCount: 0,
    createdAt: "2026-10-13T11:15:00Z",
    comments: [],
  },
];

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const categoryIds = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const { rows } = await client.query(
      `INSERT INTO forum_categories (slug, name, description, sort_order, members_only, admin_post_only)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
         sort_order = EXCLUDED.sort_order, members_only = EXCLUDED.members_only,
         admin_post_only = EXCLUDED.admin_post_only
       RETURNING id`,
      [c.slug, c.name, c.description, i + 1, !!c.membersOnly, !!c.adminPostOnly]
    );
    categoryIds[c.slug] = rows[0].id;
  }

  const authorIds = {};
  for (const a of AUTHORS) {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, role, status, is_verified)
       VALUES ($1, $2, 'user', 'inactive', false)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [`Forum Seed ${a.username}`, `forum-seed-${a.username.replace(/_/g, "-")}@auditprorx.test`]
    );
    const userId = rows[0].id;
    authorIds[a.username] = userId;

    await client.query(
      `INSERT INTO forum_profiles (user_id, username, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, role = EXCLUDED.role, updated_at = now()`,
      [userId, a.username, a.role]
    );

    if (a.pharmacy) {
      await client.query(
        `INSERT INTO pharmacy_details (user_id, pharmacy_name, address, phone, npi_number, ncpdp_number)
         SELECT $1, 'Forum Seed Pharmacy', '1 Test Street, Newark, NJ', '000-000-0000', '0000000000', '0000000'
         WHERE NOT EXISTS (SELECT 1 FROM pharmacy_details WHERE user_id = $1)`,
        [userId]
      );
    }
  }

  await client.query(`DELETE FROM forum_threads WHERE author_id = ANY($1)`, [Object.values(authorIds)]);

  let commentTotal = 0;
  for (const t of THREADS) {
    // Latest activity is the newest comment, or the post itself when there are none.
    const lastActivityAt = t.comments.at(-1)?.createdAt ?? t.createdAt;

    const { rows } = await client.query(
      `INSERT INTO forum_threads
         (category_id, author_id, title, body, image_url, is_pinned, view_count, comment_count, like_count,
          last_activity_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       RETURNING id`,
      [categoryIds[t.category], authorIds[t.author], t.title, t.body, t.imageUrl ?? null, !!t.isPinned,
        t.viewCount, t.comments.length, t.likeCount, lastActivityAt, t.createdAt]
    );

    for (const c of t.comments) {
      await client.query(
        `INSERT INTO forum_comments (thread_id, author_id, body, like_count, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [rows[0].id, authorIds[c.author], c.body, c.likeCount, c.createdAt]
      );
    }
    commentTotal += t.comments.length;
  }

  await client.query("COMMIT");
  console.log(`seeded ${CATEGORIES.length} categories, ${AUTHORS.length} authors, ${THREADS.length} threads, ${commentTotal} comments`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error(err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
