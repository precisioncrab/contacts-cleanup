/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Applying changes to cards, and undoing them.
 *
 * Every applied change is one history entry holding each card before and
 * after: { id, time, title, cards: [{ id, parentId, label, before, after,
 * photo }], undone }. `after` is the vCard as Thunderbird saved it (read
 * back), or null for a card that was deleted; `photo` is a deleted card's
 * photo as a data URL, so undo can put it back.
 *
 * Undo puts every card back as it was. A card that changed since (edited
 * in Thunderbird, or by a sync) is a conflict: undo stops and asks, and
 * goes ahead only when told to.
 *
 * `api` is the address book (src/lib/addressbook.js, or a fake in tests):
 * get(id) -> node|null, update(id, vCard), create(parentId, vCard) -> id,
 * remove(id), photo(id) -> dataUrl|null, setPhoto(id, dataUrl).
 */

import { comparable, parseVCard, serializeVCard } from "./vcard.js";

export const HISTORY_LIMIT = 50;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Applies changes in order: [{ type: "update", id, vCard, label }] or
 * [{ type: "delete", id, label }]. Stops at the first failure, so a merge
 * never deletes cards after its kept card failed to save.
 * Returns { entry, error }: the entry holds what was done, even after a failure.
 * `onProgress(done, total)` is called after each card.
 */
export async function applyChanges(api, title, changes, onProgress = () => {}) {
  const entry = { id: newId(), time: Date.now(), title, cards: [], undone: false };
  try {
    for (const [i, change] of changes.entries()) {
      const node = await api.get(change.id);
      if (!node) {
        throw new Error(`"${change.label}" isn't in the address book any more.`);
      }
      if (change.type === "delete") {
        const photo = await api.photo(change.id).catch(() => null);
        await api.remove(change.id);
        entry.cards.push({ id: change.id, parentId: node.parentId, label: change.label, before: node.vCard, after: null, photo });
      } else {
        await api.update(change.id, change.vCard);
        const saved = await api.get(change.id);
        entry.cards.push({ id: change.id, parentId: node.parentId, label: change.label, before: node.vCard, after: saved?.vCard ?? change.vCard });
      }
      onProgress(i + 1, changes.length);
    }
    return { entry, error: null };
  } catch (e) {
    return { entry, error: e?.message ?? String(e) };
  }
}

/**
 * What changed since an entry was applied: [{ label, reason }].
 * reason: "changed" (edited since), "missing" (deleted since), "exists"
 * (a deleted card is back).
 */
export async function undoConflicts(api, entry) {
  const conflicts = [];
  for (const card of entry.cards) {
    const node = await api.get(card.id).catch(() => null);
    if (card.after === null) {
      if (node) {
        conflicts.push({ label: card.label, reason: "exists" });
      }
    } else if (!node) {
      conflicts.push({ label: card.label, reason: "missing" });
    } else if (comparable(node.vCard) !== comparable(card.after)) {
      conflicts.push({ label: card.label, reason: "changed" });
    }
  }
  return conflicts;
}

/**
 * Undoes an entry: deleted cards come back (with their photos), changed
 * cards get their old vCard. With conflicts and no `force`, nothing is
 * done and { conflicts } comes back. Cards that were deleted since are
 * created again; cards that came back are left alone.
 * Returns { conflicts, done, error }.
 */
export async function undoEntry(api, entry, { force = false } = {}) {
  const conflicts = await undoConflicts(api, entry);
  if (conflicts.length && !force) {
    return { conflicts, done: false, error: null };
  }
  try {
    for (const card of [...entry.cards].reverse()) {
      const node = await api.get(card.id).catch(() => null);
      if (card.after === null || !node) {
        if (card.after === null && node) {
          continue;
        }
        const id = await createWithFallback(api, card.parentId, card.before);
        if (card.photo && id) {
          await api.setPhoto(id, card.photo).catch(() => {});
        }
      } else {
        await api.update(card.id, card.before);
      }
    }
    return { conflicts, done: true, error: null };
  } catch (e) {
    return { conflicts, done: false, error: e?.message ?? String(e) };
  }
}

/** Creates the card with its old UID (so it gets its old id back), or with a new one if Thunderbird refuses. */
async function createWithFallback(api, parentId, vCard) {
  try {
    return await api.create(parentId, vCard);
  } catch {
    const vcard = parseVCard(vCard);
    vcard.props = vcard.props.filter((p) => p.name !== "UID");
    return api.create(parentId, serializeVCard(vcard));
  }
}

/** The history with a new entry on top, at most HISTORY_LIMIT long. */
export function addEntry(history, entry) {
  return [entry, ...(history ?? [])].slice(0, HISTORY_LIMIT);
}
