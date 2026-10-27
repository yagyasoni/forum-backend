// The author join, reused by every thread and comment query so username, role,
// and the Verified Pharmacy flag are always computed the same way.
// `alias` is the table alias of the row that has an author_id column.

export function authorJoin(alias) {
  return `LEFT JOIN forum_profiles fp_${alias} ON fp_${alias}.user_id = ${alias}.author_id`;
}

export function authorColumns(alias) {
  return `
    fp_${alias}.username AS author_username,
    fp_${alias}.role AS author_role,
    EXISTS (
      SELECT 1 FROM pharmacy_details pd
      WHERE pd.user_id = ${alias}.author_id
        AND (pd.npi_number IS NOT NULL OR pd.ncpdp_number IS NOT NULL)
    ) AS author_verified`;
}

export function mapAuthor(row) {
  return {
    username: row.author_username,
    role: row.author_role,
    verified: row.author_verified,
  };
}
