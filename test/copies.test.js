/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Contacts in several address books with one UID, and labels from books
// and mailing lists. Made-up people and 555 numbers only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { vcard } from "./helpers.js";
import { readCard } from "../src/core/card.js";
import { findCopies, differences, combinedVCard, addLabels, labelsOf, copiesPlan, partnersOf, addLink, unlink, pruneLinks, followEdit, sameDetails } from "../src/core/copies.js";
import { applyChanges, undoEntry, withUid, withoutUid } from "../src/core/history.js";

const key = (book, uid) => `${book}»${uid}`;
const uidOf = (id) => id.split("»")[1];

/** A read card in a book, named like the add-on names cards (book»UID). */
function copy(book, uid, ...lines) {
  return { ...readCard({ id: key(book, uid), parentId: book, vCard: vcard(...lines, `UID:${uid}`) }, book), uid };
}

/**
 * A fake of Thunderbird's address books as add-ons see them: cards named by
 * UID, a UID in two books reaches the copy in the first book (in book
 * order), create() refuses a UID any book uses and gives a vCard without
 * one a new UID, and mailing lists hold UIDs of their own book.
 */
function fakeThunderbird(books, cards) {
  const store = cards.map((c) => ({ uid: c.uid, parentId: c.parentId, vCard: c.vCard }));
  const lists = new Map();
  let next = 0;
  const reach = (uid) => books.map((b) => store.find((c) => c.uid === uid && c.parentId === b)).find(Boolean);
  const node = (c) => ({ id: key(c.parentId, c.uid), parentId: c.parentId, vCard: c.vCard });
  const api = {
    store,
    lists,
    async get(id) {
      // A plain UID gets whichever copy Thunderbird reaches, like the real api.
      const [book, uid] = id.includes("»") ? id.split("»") : [null, id];
      const c = reach(uid);
      return c && (!book || c.parentId === book) ? node(c) : null;
    },
    async update(id, vCard) {
      const c = reach(uidOf(id));
      assert.equal(c.parentId, id.split("»")[0], "update reached another copy");
      assert.equal(/\nUID:([^\r\n]+)/.exec(vCard)?.[1], c.uid, "an update may not change the UID");
      c.vCard = vCard;
    },
    async create(parentId, vCard) {
      let uid = /\nUID:([^\r\n]+)/.exec(vCard)?.[1];
      if (uid && store.some((c) => c.uid === uid)) {
        throw new Error(`Duplicate contact id: ${uid}`);
      }
      uid ??= `new-${++next}`;
      store.push({ uid, parentId, vCard: withUid(vCard, uid) });
      return key(parentId, uid);
    },
    async remove(id) {
      const c = reach(uidOf(id));
      assert.equal(c.parentId, id.split("»")[0], "delete reached another copy");
      store.splice(store.indexOf(c), 1);
      for (const list of lists.values()) {
        if (list.parentId === c.parentId) {
          list.members = list.members.filter((m) => m !== c.uid);
        }
      }
    },
    async photo() {
      return null;
    },
    async setPhoto() {},
    async listsOf(id) {
      const [book, uid] = id.split("»");
      return [...lists].filter(([, l]) => l.parentId === book && l.members.includes(uid)).map(([lid]) => lid);
    },
    async addToList(listId, id) {
      const list = lists.get(listId);
      if (!list) {
        return false;
      }
      list.members = [...new Set([...list.members, uidOf(id)])];
      return true;
    },
    async getList(id) {
      const list = lists.get(id);
      return list ? { id, ...list, members: list.members.map((m) => key(list.parentId, m)) } : null;
    },
    async createList(parentId, { name }) {
      const id = `list-${++next}`;
      lists.set(id, { parentId, name, members: [] });
      return id;
    },
    async deleteList(id) {
      lists.delete(id);
    },
  };
  return api;
}

const inBook = (api, book) => api.store.filter((c) => c.parentId === book);
const syn = copy("syn", "u1", "FN:Pat Example", "N:Example;Pat;;;", "TEL;TYPE=cell:555-201-0001", "EMAIL:pat@example.org");
const wed = copy("wed", "u1", "FN:Pat Example", "N:Example;Pat;;;", "TEL;TYPE=cell:+1 555 201 0001", "EMAIL:pat@example.org", "IMPP;X-SERVICE-TYPE=Jabber:xmpp:+15552010001@cheogram.com");
const solo = copy("wed", "u2", "FN:Sam Solo", "EMAIL:sam@example.org");

test("copies are cards with one UID in more than one address book", () => {
  const groups = findCopies([syn, wed, solo]);
  assert.deepEqual(groups.map((g) => [g.uid, g.cards.map((c) => c.parentId)]), [["u1", ["syn", "wed"]]]);
  assert.deepEqual(differences([syn, wed]), ["phone numbers", "chat addresses"]);
});

test("combined details: one phone line in the kept copy's way, the other copy's chat address added", () => {
  const combined = readCard({ id: "x", parentId: "wed", vCard: combinedVCard([syn, wed], wed.id) }, "wed");
  assert.deepEqual(combined.phones.map((p) => p.value), ["+1 555 201 0001"]);
  assert.deepEqual(combined.chat.map((c) => c.address), ["+15552010001@cheogram.com"]);
  const other = readCard({ id: "x", parentId: "syn", vCard: combinedVCard([syn, wed], syn.id) }, "syn");
  assert.deepEqual(other.phones.map((p) => p.value), ["555-201-0001"]);
  assert.equal(other.chat.length, 1);
});

test("labels are added once, whatever their case", () => {
  const labelled = addLabels(syn.vCard, ["wedding 2", "Wedding 2", "Family"]);
  assert.deepEqual(labelsOf(labelled), ["wedding 2", "Family"]);
  assert.equal(addLabels(labelled, ["FAMILY"]), labelled);
});

test("link: the copy Thunderbird reaches gets a new UID in the same book and lists, the other keeps the UID; both get every detail", async () => {
  const api = fakeThunderbird(["wed", "syn"], [syn, wed, solo]);
  api.lists.set("wl", { parentId: "wed", name: "Wedding", members: ["u1", "u2"] });
  const plan = copiesPlan({ uid: "u1", cards: [syn, wed] }, "link", { keeper: wed.id });
  const { entry, error, results } = await applyChanges(api, "Linked", [{ type: "copies", uid: "u1", books: ["syn", "wed"], want: plan.want, label: "Pat Example" }]);
  assert.equal(error, null);
  const [ids] = results;
  assert.equal(ids.length, 2);
  const [newWed] = inBook(api, "wed").filter((c) => c.uid !== "u2");
  assert.notEqual(newWed.uid, "u1");
  assert.deepEqual(ids.sort(), [key("syn", "u1"), key("wed", newWed.uid)].sort());
  assert.deepEqual(api.lists.get("wl").members.sort(), ["u2", newWed.uid].sort());
  for (const c of [newWed, inBook(api, "syn")[0]]) {
    const read = readCard({ id: "x", parentId: c.parentId, vCard: c.vCard });
    assert.deepEqual(read.phones.map((p) => p.value), ["+1 555 201 0001"]);
    assert.equal(read.chat.length, 1);
  }
  // Now Thunderbird reaches the Synology copy.
  assert.ok(await api.get(key("syn", "u1")));

  // Undo: the details and the list come back; the wedding copy keeps a new UID (Thunderbird refuses a taken one).
  const undone = await undoEntry(api, entry);
  assert.equal(undone.done, true);
  assert.equal(inBook(api, "syn")[0].vCard, syn.vCard);
  const back = inBook(api, "wed").find((c) => c.uid !== "u2");
  assert.equal(withoutUid(back.vCard), withoutUid(wed.vCard));
  assert.deepEqual(api.lists.get("wl").members.sort(), ["u2", back.uid].sort());
});

test("keep: the reached copy is deleted when another is kept, and the kept one gets the labels", async () => {
  const api = fakeThunderbird(["wed", "syn"], [syn, wed]);
  const plan = copiesPlan({ uid: "u1", cards: [syn, wed] }, "keep", { keeper: syn.id, labels: ["wedding 2"] });
  const { error, results } = await applyChanges(api, "Kept", [{ type: "copies", uid: "u1", books: ["syn", "wed"], want: plan.want, label: "Pat" }]);
  assert.equal(error, null);
  assert.deepEqual(results[0], [key("syn", "u1")]);
  assert.equal(inBook(api, "wed").length, 0);
  const kept = inBook(api, "syn")[0];
  assert.equal(kept.uid, "u1");
  assert.deepEqual(labelsOf(kept.vCard), ["wedding 2"]);
  assert.match(kept.vCard, /cheogram/);
});

test("keep the copy Thunderbird reaches: it's made again with a new UID so the other can be deleted", async () => {
  const api = fakeThunderbird(["wed", "syn"], [syn, wed]);
  const plan = copiesPlan({ uid: "u1", cards: [syn, wed] }, "keep", { keeper: wed.id, labels: ["Synology"] });
  const { error } = await applyChanges(api, "Kept", [{ type: "copies", uid: "u1", books: ["syn", "wed"], want: plan.want, label: "Pat" }]);
  assert.equal(error, null);
  assert.equal(inBook(api, "syn").length, 0);
  assert.equal(inBook(api, "wed").length, 1);
  assert.deepEqual(labelsOf(inBook(api, "wed")[0].vCard), ["Synology"]);
});

test("separate: each copy keeps its own details, with its own UID", async () => {
  const api = fakeThunderbird(["wed", "syn"], [syn, wed]);
  const { error } = await applyChanges(api, "Separated", [{ type: "copies", uid: "u1", books: ["syn", "wed"], want: copiesPlan({ cards: [syn, wed] }, "separate").want, label: "Pat" }]);
  assert.equal(error, null);
  assert.equal(inBook(api, "syn")[0].vCard, syn.vCard);
  assert.equal(withoutUid(inBook(api, "wed")[0].vCard), withoutUid(wed.vCard));
  assert.notEqual(inBook(api, "wed")[0].uid, "u1");
});

test("a copy in an address book the change doesn't cover stops it", async () => {
  const api = fakeThunderbird(["other", "wed", "syn"], [syn, wed, copy("other", "u1", "FN:Pat")]);
  const { error } = await applyChanges(api, "Linked", [{ type: "copies", uid: "u1", books: ["syn", "wed"], want: {}, label: "Pat" }]);
  assert.match(error, /doesn't cover/);
  assert.equal(api.store.length, 3);
});

test("a deleted mailing list comes back with its members on undo", async () => {
  const api = fakeThunderbird(["wed"], [wed, solo]);
  api.lists.set("wl", { parentId: "wed", name: "Wedding", members: ["u1", "u2"] });
  const { entry } = await applyChanges(api, "Deleted the list", [{ type: "deleteList", listId: "wl", label: "Wedding" }]);
  assert.equal(api.lists.size, 0);
  assert.equal(entry.lists[0].name, "Wedding");
  await undoEntry(api, entry);
  const [list] = [...api.lists.values()];
  assert.equal(list.name, "Wedding");
  assert.deepEqual(list.members.sort(), ["u1", "u2"]);
});

test("a deleted card goes back into its mailing lists on undo", async () => {
  const api = fakeThunderbird(["wed"], [solo]);
  api.lists.set("wl", { parentId: "wed", name: "Wedding", members: ["u2"] });
  const { entry } = await applyChanges(api, "Deleted", [{ type: "delete", id: solo.id, label: "Sam" }]);
  assert.deepEqual(entry.cards[0].lists, ["wl"]);
  assert.deepEqual(api.lists.get("wl").members, []);
  await undoEntry(api, entry);
  assert.deepEqual(api.lists.get("wl").members, ["u2"]);
});

test("links: partners, joining, unlinking, pruning; an edit carried to a linked copy keeps its own UID", () => {
  let links = addLink([], ["a", "b"]);
  links = addLink(links, ["b", "c"]);
  assert.deepEqual(links.map((g) => [...g].sort()), [["a", "b", "c"]]);
  assert.deepEqual(partnersOf(links, "b").sort(), ["a", "c"]);
  assert.deepEqual(unlink(links, "a").map((g) => [...g].sort()), [["b", "c"]]);
  assert.deepEqual(pruneLinks(links, (id) => id === "a"), []);
  const edited = vcard("FN:Pat Example", "TEL;TYPE=cell:555-201-0002", "UID:other");
  const followed = followEdit(syn.vCard, edited);
  assert.match(followed, /555-201-0002/);
  assert.match(followed, /UID:u1/);
  assert.equal(sameDetails(followed, edited), true);
  assert.equal(sameDetails(syn.vCard, edited), false);
});
