import { events, EVENT_ENTITY_TYPES, EVENT_TYPES } from "./schema";
import type { OrchestraDb } from "./db";

export type EventEntityType = (typeof EVENT_ENTITY_TYPES)[number];
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * D6/D17 (Phase 1 spec §1) — one row per real state-changing operation.
 * `payload` is the already-`Schema.parse()`-validated domain object itself,
 * JSON-serialized: a faithful snapshot of what the materialized row looked
 * like at that moment, not an independently-validated event schema — D6's
 * own framing is that `events` is a diary, never replayed to reconstruct
 * state, so its payload doesn't need its own contract.
 */
export function writeEvent(
  db: OrchestraDb,
  entityType: EventEntityType,
  entityId: string,
  eventType: EventType,
  payload: unknown,
): void {
  db.insert(events)
    .values({
      entityType,
      entityId,
      eventType,
      payload,
      recordedAt: new Date().toISOString(),
    })
    .run();
}
