-- Add 'other' as a valid role option.
-- The CHECK constraint was created inline in 001, so Postgres named it forum_profiles_role_check.
ALTER TABLE forum_profiles
  DROP CONSTRAINT IF EXISTS forum_profiles_role_check;

ALTER TABLE forum_profiles
  ADD CONSTRAINT forum_profiles_role_check
  CHECK (role IN ('owner', 'pharmacist', 'technician', 'consultant', 'student', 'other'));
