-- PR #2 review, 2026-07-18 — a real database that already had work_intents
-- rows before migration 0003 added the FK from work_intents.repo_slug to
-- repos.slug got those pre-existing rows carried forward with FK
-- enforcement OFF (migrate() always runs before createDb() turns PRAGMA
-- foreign_keys on — see db.ts) — so they landed in the rebuilt table
-- without a matching repos row, silently violating the relationship the FK
-- exists to enforce, from that point on. Confirmed on a real
-- ~/.orchestra/orchestra.db copy: this repo's own PR #1 fixture-dispatch
-- history left exactly one such row (repo_slug "blossvm-orchestra") with no
-- repos row until it happened to get registered later by coincidence — a
-- fresh install pointed at a different repo would not have that coincidence.
--
-- Backfills one synthetic repos row per distinct work_intents.repo_slug that
-- has none yet. root_path is a placeholder, not a real path — this is a
-- data-integrity repair, not a claim that Orchestra knows where that repo
-- actually lives; JD (or whoever owns the db) re-registers it for real via
-- POST /repos when they next work with it, which updates root_path to the
-- truth via a normal insert-or-replace path, not this migration.
INSERT INTO repos (id, slug, root_path, registered_at)
SELECT
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  ),
  wi.repo_slug,
  '(unknown — backfilled by migration 0004, re-register via POST /repos)',
  '1970-01-01T00:00:00.000Z'
FROM (SELECT DISTINCT repo_slug FROM work_intents) wi
LEFT JOIN repos r ON r.slug = wi.repo_slug
WHERE r.slug IS NULL;
