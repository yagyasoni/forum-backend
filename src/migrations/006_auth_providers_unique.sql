-- Google sign-in upserts on (user_id, provider). The auth_providers table that AuditProRx already
-- created has only an id primary key, so 004 is skipped there and the upsert has nothing to match.
-- This index gives it one. Safe to run more than once.
CREATE UNIQUE INDEX IF NOT EXISTS auth_providers_user_provider_idx ON auth_providers (user_id, provider);
