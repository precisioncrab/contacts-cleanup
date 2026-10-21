/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The address book layer as a Manifest V2 add-on, against a fake of
// Thunderbird's browser.contacts that keeps properties the way Thunderbird
// does (a card's custom properties survive an update unless set to null).

import { test } from "node:test";
import assert from "node:assert/strict";
import { vcard } from "./helpers.js";

const jane = vcard("FN:Jane Doe", "TEL;TYPE=cell:555-123-4567", "UID:j");

function fakeThunderbird() {
  // Jane carries leftovers from Thunderbird 158's Manifest V3 bug: one property per character.
  const cards = new Map([["j", { parentId: "book-1", properties: { vCard: jane, FirstName: "Jane", 0: "B", 1: "E", 2: "G" } }]]);
  const calls = [];
  const contacts = {
    async get(id) {
      const c = cards.get(id);
      return c ? { id, parentId: c.parentId, type: "contact", readOnly: false, properties: { ...c.properties } } : undefined;
    },
    async update(id, properties) {
      calls.push(["update", id, properties]);
      // Thunderbird's V2 update: the vCard wins; custom properties merge, null removes.
      const card = cards.get(id);
      const merged = { ...card.properties, ...properties };
      card.properties = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null));
    },
    async create(parentId, id, properties) {
      calls.push(["create", parentId, id, properties]);
      cards.set("new", { parentId, properties: { ...properties } });
      return "new";
    },
    async delete(id) {
      cards.delete(id);
    },
  };
  globalThis.browser = {
    contacts,
    addressBooks: {
      async list() {
        return [{ id: "book-1", name: "Personal", contacts: [...cards].map(([id, c]) => ({ id, parentId: c.parentId, type: "contact", properties: { ...c.properties } })) }];
      },
    },
  };
  return { cards, calls };
}

const { loadBooks, api, isJunkProperty } = await import("../src/lib/addressbook.js");

test("cards are read from V2 nodes, with how many leftover properties they carry", async () => {
  fakeThunderbird();
  const [book] = await loadBooks();
  assert.deepEqual(book.contacts.map((c) => [c.id, c.vCard, c.junk]), [["j", jane, 3]]);
  assert.equal(isJunkProperty("12"), true);
  assert.equal(isJunkProperty("FirstName"), false);
});

test("writes pass the vCard as { vCard } (V2), so Thunderbird stores nothing extra", async () => {
  const { calls } = fakeThunderbird();
  await api.update("j", jane);
  await api.create("book-1", jane);
  assert.deepEqual(calls, [["update", "j", { vCard: jane }], ["create", "book-1", null, { vCard: jane }]]);
});

test("repair clears the leftover properties and saves the same vCard", async () => {
  const { cards, calls } = fakeThunderbird();
  assert.equal(await api.repair("j"), 3);
  assert.deepEqual(calls[0], ["update", "j", { vCard: jane, 0: null, 1: null, 2: null }]);
  assert.deepEqual(cards.get("j").properties, { vCard: jane, FirstName: "Jane" });
  assert.equal(await api.repair("j"), 0);
  assert.equal(calls.length, 1);
});
