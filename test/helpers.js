/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test cards: made-up people and 555 numbers only.

import { readCard } from "../src/core/card.js";

/** vCard 4.0 text from lines, the way Thunderbird writes it. */
export function vcard(...lines) {
  return ["BEGIN:VCARD", "VERSION:4.0", ...lines, "END:VCARD"].join("\r\n") + "\r\n";
}

let next = 1;

/** A read card from vCard lines. */
export function card(lines, { id = `card-${next++}`, parentId = "book-1", book = "Personal Address Book", readOnly = false } = {}) {
  return readCard({ id, parentId, vCard: vcard(...lines, `UID:${id}`), readOnly }, book);
}

/**
 * A fake address book with Thunderbird's behavior where it matters: get()
 * of a missing card gives null, create() with a UID in use throws, and
 * create() uses the vCard's UID as the id.
 */
export function fakeBook(cards = []) {
  const nodes = new Map(cards.map((c) => [c.id, { id: c.id, parentId: c.parentId ?? "book-1", vCard: c.vCard }]));
  const photos = new Map();
  let created = 0;
  return {
    nodes,
    photos,
    calls: [],
    async get(id) {
      const node = nodes.get(id);
      return node ? { ...node } : null;
    },
    async update(id, vCard) {
      this.calls.push(["update", id]);
      if (!nodes.has(id)) {
        throw new Error("no such card");
      }
      nodes.get(id).vCard = vCard;
    },
    async create(parentId, vCard) {
      this.calls.push(["create", parentId]);
      const uid = /\r?\nUID:([^\r\n]+)/.exec(vCard)?.[1] ?? `new-${++created}`;
      if (nodes.has(uid)) {
        throw new Error("UID in use");
      }
      nodes.set(uid, { id: uid, parentId, vCard });
      return uid;
    },
    async remove(id) {
      this.calls.push(["remove", id]);
      nodes.delete(id);
    },
    async photo(id) {
      return photos.get(id) ?? null;
    },
    async setPhoto(id, dataUrl) {
      photos.set(id, dataUrl);
    },
  };
}
