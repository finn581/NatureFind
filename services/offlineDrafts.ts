/**
 * Offline campground contribution drafts — in-memory queue.
 *
 * Drafts are held in a module-level array for the lifetime of the app session.
 * When the user saves campground data and the Firestore write fails (no signal),
 * the edit is enqueued here. Calling syncPendingDrafts() retries all queued
 * edits — call it on app focus or when connectivity is restored.
 *
 * Session-level persistence is appropriate for campground contribution drafts:
 * the data is small and the user is still present to retry if needed.
 */

import { saveCampgroundContribution } from "./firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampDraft {
  campId: string;
  data: {
    fee?: boolean | null;
    showers?: boolean | null;
    toilets?: boolean | null;
    tents?: boolean | null;
    caravans?: boolean | null;
  };
  displayName: string;
  savedAt: number; // Unix ms
}

// ─── In-memory queue ──────────────────────────────────────────────────────────

const queue: CampDraft[] = [];

// ─── Public API ───────────────────────────────────────────────────────────────

/** Add or replace a campground edit draft in the queue. */
export function saveDraft(draft: Omit<CampDraft, "savedAt">): void {
  const idx = queue.findIndex((d) => d.campId === draft.campId);
  const entry: CampDraft = { ...draft, savedAt: Date.now() };
  if (idx >= 0) {
    queue[idx] = entry;
  } else {
    queue.push(entry);
  }
}

/** Remove a specific campground from the draft queue. */
export function removeDraft(campId: string): void {
  const idx = queue.findIndex((d) => d.campId === campId);
  if (idx >= 0) queue.splice(idx, 1);
}

/** Number of pending drafts. */
export function getDraftCount(): number {
  return queue.length;
}

/** All pending drafts. */
export function getPendingDrafts(): CampDraft[] {
  return [...queue];
}

/**
 * Attempt to sync all queued drafts to Firestore.
 * Successfully synced drafts are removed from the queue.
 * Returns the count of successfully synced drafts.
 */
export async function syncPendingDrafts(): Promise<number> {
  if (queue.length === 0) return 0;

  let synced = 0;
  for (const draft of [...queue]) {
    try {
      await saveCampgroundContribution(draft.campId, draft.data, draft.displayName);
      removeDraft(draft.campId);
      synced++;
    } catch {
      // Leave in queue — will retry on next call
    }
  }
  return synced;
}
