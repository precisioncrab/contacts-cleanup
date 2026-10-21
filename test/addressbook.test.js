/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The address book layer as a Manifest V2 add-on, against a fake of
// Thunderbird's browser.contacts that keeps properties the way Thunderbird
// does (a card's custom properties survive an update unless set to null),
// and reaches only one copy of a UID that's in two address books.

import { test } from "node:test";
import assert from "node:assert/strict";
import { vcard } from "./helpers.js";

const jane = vcard("FN:Jane Doe", "TEL;TYPE=cell:555-123-4567", "UID:j");

function fakeThunderbird() {
  // Jane is in two address books with one UID; Thunderbird reaches the book-1 copy.
  // She carries leftovers from Thunderbird 158's Manifest V3 bug: one property per character.
  const cards = [
    { uid: "j", parentId: "book-1", properties: { vCard: jane, FirstName: "Jane", 0: "B", 1: "E", 2: "G" } },
    { uid: "j", parentId: "book-2", properties: { vCard: jane } },
  ];
  const calls = [];
  const node = (c) => ({ id: c.uid, parentId: c.parentId, type: "contact", readOnly: false, properties: { ...c.properties } });
  const contacts = {
    async get(id) {
      const c = cards.find((x) => x.uid === id);
      return c ? node(c) : undefined;
    },
    async update(id, properties) {
      calls.push(["update", id, properties]);
      // Thunderbird's V2 update: the vCard wins; custom properties merge, null removes.
      const card = cards.find((x) => x.uid === id);
      const merged = { ...card.properties, ...properties };
      card.properties = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null));
    },
    async create(parentId, id, properties) {
      calls.push(["create", parentId, id, properties]);
      cards.push({ uid: "new", parentId, properties: { ...properties } });
      return "new";
    },
    async delete(id) {
      calls.push(["delete", id]);
    },
  };
  globalThis.browser = {
    contacts,
    addressBooks: {
      async list() {
        return ["book-1", "book-2"].map((id) => ({ id, name: id, contacts: cards.filter((c) => c.parentId === id).map(node) }));
      },
    },
  };
  return { cards, calls };
}

const { loadBooks, api, isJunkProperty, cardKey, splitKey, reachableBook } = await import("../src/lib/addressbook.js");

test("cards are read from V2 nodes, named by address book and UID, with how many leftover properties they carry", async () => {
  fakeThunderbird();
  const books = await loadBooks();
  assert.deepEqual(books.map((b) => b.contacts.map((c) => [c.id, c.uid, c.junk])), [[[cardKey("book-1", "j"), "j", 3]], [[cardKey("book-2", "j"), "j", 0]]]);
  assert.deepEqual(splitKey(cardKey("book-2", "j")), { book: "book-2", uid: "j" });
  assert.deepEqual(splitKey("j"), { book: null, uid: "j" });
  assert.equal(await reachableBook("j"), "book-1");
  assert.equal(isJunkProperty("12"), true);
  assert.equal(isJunkProperty("FirstName"), false);
});

test("writes pass the vCard as { vCard } (V2), so Thunderbird stores nothing extra", async () => {
  const { calls } = fakeThunderbird();
  await api.update(cardKey("book-1", "j"), jane);
  assert.equal(await api.create("book-1", jane), cardKey("book-1", "new"));
  assert.deepEqual(calls, [["update", "j", { vCard: jane }], ["create", "book-1", null, { vCard: jane }]]);
});

test("a write to the copy Thunderbird doesn't reach is refused, never sent to the other copy", async () => {
  const { calls } = fakeThunderbird();
  await assert.rejects(api.update(cardKey("book-2", "j"), jane), /two address books with the same ID/);
  await assert.rejects(api.remove(cardKey("book-2", "j")), /two address books/);
  assert.equal(await api.get(cardKey("book-2", "j")), null);
  assert.equal(calls.length, 0);
  // A plain UID (older undo history) still works.
  await api.update("j", jane);
  assert.equal(calls.length, 1);
});

test("repair clears the leftover properties and saves the same vCard", async () => {
  const { cards, calls } = fakeThunderbird();
  assert.equal(await api.repair(cardKey("book-1", "j")), 3);
  assert.deepEqual(calls[0], ["update", "j", { vCard: jane, 0: null, 1: null, 2: null }]);
  assert.deepEqual(cards[0].properties, { vCard: jane, FirstName: "Jane" });
  assert.equal(await api.repair(cardKey("book-1", "j")), 0);
  assert.equal(calls.length, 1);
});
