-- D6: the events table is a write-only audit trail, never a mutable record.
-- Enforced at the SQL layer, not just convention (Fable review, 2026-07-18,
-- F5 — verified empirically that without these triggers, both UPDATE and
-- DELETE against `events` silently succeed).
CREATE TRIGGER events_no_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events is append-only: UPDATE is forbidden (D6)');
END;
--> statement-breakpoint
CREATE TRIGGER events_no_delete
BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'events is append-only: DELETE is forbidden (D6)');
END;
