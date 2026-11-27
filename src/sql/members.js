// Forum members (see migrations/008_forum_members.sql). The forum reads AuditProRx's users table
// but never writes to it, so a forum-only signup never shows up in AuditProRx.
// Every function takes an open transaction client.

// Moves votes from one voter id to another without counting any thread twice.
// Shared with sign-in, which moves a visitor's device votes onto their account.
export async function moveVotes(client, toId, fromId) {
  if (!fromId || !/^[A-Za-z0-9_-]{8,64}$/.test(fromId) || fromId === toId) return;

  // Threads only the old id voted on: take them over.
  await client.query(
    `UPDATE forum_votes SET voter_id = $1, updated_at = now()
     WHERE voter_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM forum_votes u WHERE u.voter_id = $1 AND u.thread_id = forum_votes.thread_id
       )`,
    [toId, fromId]
  );

  // Threads both voted on: remove the old vote and subtract its value from the score.
  await client.query(
    `UPDATE forum_threads t SET like_count = t.like_count - v.value
     FROM forum_votes v
     WHERE v.thread_id = t.id AND v.voter_id = $1`,
    [fromId]
  );
  await client.query(`DELETE FROM forum_votes WHERE voter_id = $1`, [fromId]);
}

// The member for an AuditProRx user ({ id, email, name }). Their member id is their users id.
export async function memberForUser(client, user) {
  const { rows: linked } = await client.query(`SELECT id FROM forum_members WHERE id = $1`, [user.id]);
  if (linked.length > 0) return user.id;

  // They joined the forum with Google before they had an AuditProRx account. Link that member
  // to the account: its id becomes the users id, and ON UPDATE CASCADE moves their posts with it.
  const { rows: forumOnly } = await client.query(
    `SELECT id FROM forum_members WHERE user_id IS NULL AND lower(email) = lower($1)`,
    [user.email]
  );
  if (forumOnly.length > 0) {
    const oldId = forumOnly[0].id;
    await client.query(
      `UPDATE forum_members SET id = $1, user_id = $1, email = $2, name = $3 WHERE id = $4`,
      [user.id, user.email, user.name, oldId]
    );
    await moveVotes(client, user.id, oldId); // votes are keyed by text, so they do not cascade
    return user.id;
  }

  await client.query(
    `INSERT INTO forum_members (id, user_id, email, name) VALUES ($1, $1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [user.id, user.email, user.name]
  );
  return user.id;
}

// The member for a verified Google account. Returns { id } or { error, status }.
export async function memberForGoogle(client, { email, name, sub }) {
  // An AuditProRx account with this email: the member is linked to it.
  const { rows: users } = await client.query(
    `SELECT id, email, name, status FROM users WHERE lower(email) = lower($1)
     ORDER BY (email = $1) DESC LIMIT 1`,
    [email]
  );
  if (users.length > 0) {
    if (users[0].status !== "active") return { error: "Account inactive", status: 403 };
    return { id: await memberForUser(client, users[0]) };
  }

  // No AuditProRx account: a forum-only member, found by Google id first, then by email.
  const findForumOnly = () =>
    client.query(
      `SELECT id, status FROM forum_members
       WHERE user_id IS NULL AND (google_sub = $1 OR lower(email) = lower($2))
       ORDER BY (google_sub = $1) DESC NULLS LAST LIMIT 1`,
      [sub, email]
    );

  let { rows } = await findForumOnly();
  if (rows.length === 0) {
    // DO NOTHING covers a second sign-in racing this one; the select below then finds its row.
    await client.query(
      `INSERT INTO forum_members (email, name, google_sub) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [email, name || email.split("@")[0], sub]
    );
    ({ rows } = await findForumOnly());
  } else {
    await client.query(`UPDATE forum_members SET google_sub = $2 WHERE id = $1 AND google_sub IS NULL`, [rows[0].id, sub]);
  }

  if (rows[0].status !== "active") return { error: "Account inactive", status: 403 };
  return { id: rows[0].id };
}
