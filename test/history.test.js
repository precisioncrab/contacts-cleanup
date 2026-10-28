/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { vcard, fakeBook } from "./helpers.js";
import { applyChanges, undoEntry, undoConflicts, addEntry, HISTORY_LIMIT } from "../src/core/history.js";

const A = { id: "a", parentId: "book-1", vCard: vcard("FN:Jane Doe", "UID:a") };
const B = { id: "b", parentId: "book-2", vCard: vcard("FN:J Doe", "UID:b") };

test("applying records each card before and after, with progress", async () => {
  const book = fakeBook([A, B]);
  book.photos.set("b", "data:image/png;base64,AAAA");
  const progress = [];
  const { entry, error } = await applyChanges(book, "Merged", [
    { type: "update", id: "a", vCard: vcard("FN:Jane Doe", "EMAIL:jane@example.org", "UID:a"), label: "Jane Doe" },
    { type: "delete", id: "b", label: "J Doe" },
  ], (done, total) => progress.push(`${done}/${total}`));
  assert.equal(error, null);
  assert.deepEqual(progress, ["1/2", "2/2"]);
  assert.equal(entry.cards[0].before, A.vCard);
  assert.ok(entry.cards[0].after.includes("EMAIL"));
  assert.deepEqual(entry.cards[1], { id: "b", parentId: "book-2", label: "J Doe", before: B.vCard, after: null, photo: "data:image/png;base64,AAAA" });
  assert.equal(book.nodes.has("b"), false);
});

test("a failure stops before anything else is deleted", async () => {
  const book = fakeBook([A, B]);
  book.update = async () => {
    throw new Error("read-only");
  };
  const { entry, error } = await applyChanges(book, "Merged", [
    { type: "update", id: "a", vCard: "x", label: "Jane Doe" },
    { type: "delete", id: "b", label: "J Doe" },
  ]);
  assert.equal(error, "read-only");
  assert.equal(entry.cards.length, 0);
  assert.equal(book.nodes.has("b"), true);
});

test("undo puts changed cards back and brings deleted ones back with their photos", async () => {
  const book = fakeBook([A, B]);
  book.photos.set("b", "data:photo");
  const { entry } = await applyChanges(book, "Merged", [
    { type: "update", id: "a", vCard: vcard("FN:Jane", "UID:a"), label: "Jane" },
    { type: "delete", id: "b", label: "J Doe" },
  ]);
  book.photos.clear();
  const result = await undoEntry(book, entry);
  assert.deepEqual(result, { conflicts: [], done: true, error: null });
  assert.equal(book.nodes.get("a").vCard, A.vCard);
  assert.equal(book.nodes.get("b").vCard, B.vCard);
  assert.equal(book.nodes.get("b").parentId, "book-2");
  assert.equal(book.photos.get("b"), "data:photo");
});

test("undo asks first when a card changed since, then goes ahead when told", async () => {
  const book = fakeBook([A]);
  const { entry } = await applyChanges(book, "Name", [{ type: "update", id: "a", vCard: vcard("FN:Jane", "UID:a"), label: "Jane" }]);
  book.nodes.get("a").vCard = vcard("FN:Jane", "NOTE:edited in Thunderbird", "UID:a");
  assert.deepEqual(await undoConflicts(book, entry), [{ label: "Jane", reason: "changed" }]);
  const first = await undoEntry(book, entry);
  assert.equal(first.done, false);
  assert.equal(book.nodes.get("a").vCard.includes("edited"), true);
  const forced = await undoEntry(book, entry, { force: true });
  assert.equal(forced.done, true);
  assert.equal(book.nodes.get("a").vCard, A.vCard);
});

test("a sync that only touches REV isn't a conflict", async () => {
  const book = fakeBook([A]);
  const { entry } = await applyChanges(book, "Name", [{ type: "update", id: "a", vCard: vcard("FN:Jane", "UID:a"), label: "Jane" }]);
  book.nodes.get("a").vCard = vcard("FN:Jane", "UID:a", "REV:20261020T120000Z");
  assert.deepEqual(await undoConflicts(book, entry), []);
});

test("a card deleted since is created again on a forced undo; one that came back is left alone", async () => {
  const book = fakeBook([A, B]);
  const { entry } = await applyChanges(book, "Merged", [
    { type: "update", id: "a", vCard: vcard("FN:Jane", "UID:a"), label: "Jane" },
    { type: "delete", id: "b", label: "J Doe" },
  ]);
  book.nodes.delete("a");
  book.nodes.set("b", { id: "b", parentId: "book-2", vCard: vcard("FN:Back again", "UID:b") });
  const conflicts = await undoConflicts(book, entry);
  assert.deepEqual(conflicts.map((c) => c.reason).sort(), ["exists", "missing"]);
  const result = await undoEntry(book, entry, { force: true });
  assert.equal(result.done, true);
  assert.equal(book.nodes.get("a").vCard, A.vCard);
  assert.ok(book.nodes.get("b").vCard.includes("Back again"));
});

test("history keeps the newest entries", () => {
  let history = [];
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    history = addEntry(history, { id: String(i) });
  }
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].id, String(HISTORY_LIMIT + 4));
});

const PHOTO = "PHOTO;VALUE=URL:data:image/png;base64,QUJD";

test("a change that leaves the photo alone stores both vCards without it; undo puts the photo back", async () => {
  const book = fakeBook([{ id: "p", parentId: "book-1", vCard: vcard("FN:Jane Doe", PHOTO, "UID:p") }]);
  const { entry } = await applyChanges(book, "Name", [{ type: "update", id: "p", vCard: vcard("FN:Jane", PHOTO, "UID:p"), label: "Jane" }]);
  const [card] = entry.cards;
  assert.equal(card.photoKept, true);
  assert.ok(!card.before.includes("PHOTO") && !card.after.includes("PHOTO"));
  // A sync touching the photo afterwards is no conflict, and the photo on the card now stays.
  book.nodes.get("p").vCard = vcard("FN:Jane", "PHOTO;VALUE=URL:data:image/png;base64,TkVX", "UID:p");
  const result = await undoEntry(book, entry);
  assert.equal(result.done, true);
  assert.ok(book.nodes.get("p").vCard.includes("FN:Jane Doe"));
  assert.ok(book.nodes.get("p").vCard.includes("base64,TkVX"));
});

test("a change of photo is stored whole; a deleted card's photo comes back from its vCard", async () => {
  const book = fakeBook([
    { id: "a", parentId: "book-1", vCard: vcard("FN:A", "UID:a") },
    { id: "b", parentId: "book-1", vCard: vcard("FN:B", PHOTO, "UID:b") },
  ]);
  let asked = 0;
  book.photo = async () => {
    asked++;
    return null;
  };
  const { entry } = await applyChanges(book, "Merged", [
    { type: "update", id: "a", vCard: vcard("FN:A", PHOTO, "UID:a"), label: "A" },
    { type: "delete", id: "b", label: "B" },
  ]);
  assert.equal(entry.cards[0].photoKept, undefined);
  assert.ok(entry.cards[0].after.includes("PHOTO"));
  assert.equal(asked, 0);
  await undoEntry(book, entry);
  assert.ok(!book.nodes.get("a").vCard.includes("PHOTO"));
  assert.ok(book.nodes.get("b").vCard.includes(PHOTO));
});

test("a created card is recorded with no before; undo deletes it, and asks first if it changed since", async () => {
  const book = fakeBook([]);
  const vCard = vcard("FN:Patricia Roe", "TEL;TYPE=cell:+1 555 666 7777");
  const { entry, error } = await applyChanges(book, "New card: Patricia Roe", [{ type: "create", parentId: "book-1", vCard, label: "Patricia Roe" }]);
  assert.equal(error, null);
  assert.equal(entry.cards.length, 1);
  const [created] = entry.cards;
  assert.equal(created.before, null);
  assert.equal(book.nodes.get(created.id).vCard, vCard);

  // Edited since: undo asks, then deletes when told.
  book.nodes.get(created.id).vCard = vcard("FN:Patricia Roe", "TEL;TYPE=cell:+1 555 666 7777", "NOTE:met at the fair");
  const asked = await undoEntry(book, entry);
  assert.equal(asked.done, false);
  assert.deepEqual(asked.conflicts.map((c) => c.reason), ["changed"]);
  assert.equal((await undoEntry(book, entry, { force: true })).done, true);
  assert.equal(book.nodes.has(created.id), false);

  // Deleted since: nothing left to undo, and no question.
  const again = await applyChanges(book, "New card", [{ type: "create", parentId: "book-1", vCard, label: "Patricia Roe" }]);
  book.nodes.delete(again.entry.cards[0].id);
  assert.deepEqual(await undoEntry(book, again.entry), { conflicts: [], done: true, error: null });
});

/** fakeBook with address books that can be made, checked and deleted. */
function withBooks(api) {
  const books = new Set(["book-1"]);
  let made = 0;
  return Object.assign(api, {
    books,
    async createBook() {
      const id = `made-${++made}`;
      books.add(id);
      return id;
    },
    async bookExists(id) {
      return books.has(id);
    },
    async bookIsEmpty(id) {
      return ![...api.nodes.values()].some((n) => n.parentId === id);
    },
    async deleteBook(id) {
      books.delete(id);
    },
  });
}

test("an import into a new address book makes it first; undo deletes it with its cards", async () => {
  const api = withBooks(fakeBook());
  const { entry, error } = await applyChanges(api, "Import", [
    { type: "createBook", name: "Demo", ref: "new", label: "Demo" },
    { type: "create", bookRef: "new", vCard: vcard("FN:Jane Doe"), label: "Jane Doe" },
    { type: "create", bookRef: "new", vCard: vcard("FN:Tom Ashby"), label: "Tom Ashby" },
  ]);
  assert.equal(error, null);
  assert.deepEqual(entry.madeBooks, [{ id: "made-1", name: "Demo" }]);
  assert.deepEqual([...api.nodes.values()].map((n) => n.parentId), ["made-1", "made-1"]);
  const result = await undoEntry(api, entry);
  assert.equal(result.done, true);
  assert.equal(api.nodes.size, 0);
  assert.equal(api.books.has("made-1"), false);
  assert.equal(result.keptBooks, undefined);
});

test("undo keeps a made address book that something else went into since", async () => {
  const api = withBooks(fakeBook());
  const { entry } = await applyChanges(api, "Import", [
    { type: "createBook", name: "Demo", ref: "new", label: "Demo" },
    { type: "create", bookRef: "new", vCard: vcard("FN:Jane Doe"), label: "Jane Doe" },
  ]);
  await api.create("made-1", vcard("FN:Someone Else"));
  const result = await undoEntry(api, entry);
  assert.equal(result.done, true);
  assert.equal(api.books.has("made-1"), true);
  assert.deepEqual(result.keptBooks, ["Demo"]);
  assert.equal(api.nodes.size, 1);
});

test("a card for an address book that wasn't made stops the import", async () => {
  const api = withBooks(fakeBook());
  const { error } = await applyChanges(api, "Import", [{ type: "create", bookRef: "new", vCard: vcard("FN:Jane Doe"), label: "Jane Doe" }]);
  assert.match(error, /wasn't made/);
  assert.equal(api.nodes.size, 0);
});
