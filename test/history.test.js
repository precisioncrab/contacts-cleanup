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
