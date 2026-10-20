/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { card } from "./helpers.js";
import { findDuplicates, mergeOptions, mergeVCard, nameKey, pairKey } from "../src/core/duplicates.js";
import { parseVCard, getAll, first } from "../src/core/vcard.js";
import { readCard } from "../src/core/card.js";

const ids = (groups) => groups.map((g) => g.cards.map((c) => c.id).sort());

test("name keys ignore case, accents, punctuation and word order", () => {
  assert.equal(nameKey("José  O'Brien"), nameKey("o brien, jose"));
  assert.notEqual(nameKey("Jane Doe"), nameKey("Jane Dole"));
});

test("cards sharing an email, number (any format), chat address or name are grouped", () => {
  const a = card(["FN:Jane Doe", "EMAIL:jane@example.org"], { id: "a" });
  const b = card(["FN:J. Doe", "EMAIL:JANE@example.org"], { id: "b" });
  const c = card(["FN:Sam Roe", "TEL:(555) 123-4567"], { id: "c" });
  const d = card(["FN:Sammy", "TEL:+1 555 123 4567"], { id: "d" });
  const e = card(["FN:Alex Poe", "IMPP:xmpp:alex@chat.example.org"], { id: "e" });
  const f = card(["FN:Alex P", "X-JABBER:alex@chat.example.org"], { id: "f" });
  const g = card(["FN:Kim Lee"], { id: "g" });
  const h = card(["FN:Lee, Kim"], { id: "h" });
  const loner = card(["FN:Nobody Else", "EMAIL:nobody@example.org"], { id: "z" });
  const groups = findDuplicates([a, b, c, d, e, f, g, h, loner]);
  assert.deepEqual(ids(groups).sort(), [["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]]);
  assert.deepEqual(groups.find((x) => x.cards[0].id === "c" || x.cards[1].id === "c").reasons, ["same phone number"]);
  assert.deepEqual(groups.find((x) => x.cards.some((y) => y.id === "g")).reasons, ["same name"]);
});

test("chains join into one group; dismissed pairs don't link", () => {
  const a = card(["FN:Jane Doe", "EMAIL:jane@example.org"], { id: "a" });
  const b = card(["FN:Jane Doe", "TEL:555-123-4567"], { id: "b" });
  const c = card(["FN:Janie", "TEL:5551234567"], { id: "c" });
  assert.deepEqual(ids(findDuplicates([a, b, c])), [["a", "b", "c"]]);
  assert.deepEqual(ids(findDuplicates([a, b, c], new Set([pairKey("b", "c")]))), [["a", "b"]]);
  assert.deepEqual(ids(findDuplicates([a, b, c], new Set([pairKey("b", "c"), pairKey("a", "b")]))), []);
});

test("read-only cards and names that are only an address are left out", () => {
  const a = card(["FN:Jane Doe"], { id: "a" });
  const b = card(["FN:Jane Doe"], { id: "b", readOnly: true });
  const c = card(["FN:x@example.org"], { id: "c" });
  const d = card(["FN:x@example.org"], { id: "d" });
  assert.deepEqual(ids(findDuplicates([a, b, c, d])), []);
});

const keeperLines = [
  "FN:Jane Doe",
  "N:Doe;Jane;;;",
  "EMAIL;PREF=1:jane@example.org",
  "TEL;TYPE=cell:(555) 123-4567",
  "PHOTO;VALUE=URL:data:image/png;base64,AAAA",
  "X-MOZILLA-HTML:TRUE",
  "NOTE:Met at the fair",
  "CATEGORIES:Friends",
];
const otherLines = [
  "FN:J Doe",
  "EMAIL;PREF=1:jdoe@work.example.org",
  "TEL;TYPE=work:+1 555 123 4567",
  "TEL;TYPE=home:555-765-4321",
  "IMPP:xmpp:jane@chat.example.org",
  "ADR;TYPE=home:;;1 Main St;Springfield;;55555;USA",
  "ORG:Example Co",
  "BDAY:1990-01-02",
  "NOTE:Works at Example Co",
  "CATEGORIES:Work,friends",
  "GENDER:F",
  "item1.URL:https://example.org/jane/",
  "item1.X-ABLabel:Blog",
];

test("merge options list every distinct value; the card with a photo is kept by default", () => {
  const keeper = card(keeperLines, { id: "k" });
  const other = card(otherLines, { id: "o" });
  const options = mergeOptions([other, keeper]);
  assert.equal(options.keeper, "k");
  assert.deepEqual(options.names.sort(), ["J Doe", "Jane Doe"]);
  const tel = options.multi.find((f) => f.name === "TEL");
  assert.deepEqual(tel.values.map((v) => [v.text, v.from]), [["(555) 123-4567", "k"], ["555-765-4321", "o"]]);
  assert.deepEqual(options.single.map((f) => f.name), ["ORG", "BDAY"]);
  assert.equal(options.notes.length, 2);
  assert.deepEqual(options.categories, ["Friends", "Work"]);
});

test("a merge keeps every picked value and the kept card's own lines", () => {
  const keeper = card(keeperLines, { id: "k" });
  const other = card(otherLines, { id: "o" });
  const options = mergeOptions([keeper, other]);
  const multi = Object.fromEntries(options.multi.map((f) => [f.name, new Set(f.values.map((v) => v.key))]));
  const text = mergeVCard([keeper, other], "k", { name: "Jane Doe", multi, single: { ORG: "Example Co", BDAY: "1990-01-02" }, note: "Met at the fair\n\nWorks at Example Co" });
  const merged = parseVCard(text);
  const values = (name) => getAll(merged, name).map((p) => p.value);

  assert.deepEqual(values("FN"), ["Jane Doe"]);
  assert.deepEqual(values("EMAIL"), ["jane@example.org", "jdoe@work.example.org"]);
  // The kept card's PREF stays; the added email loses its own.
  assert.equal(getAll(merged, "EMAIL")[1].raw, "EMAIL:jdoe@work.example.org");
  assert.deepEqual(values("TEL"), ["(555) 123-4567", "555-765-4321"]);
  assert.deepEqual(values("IMPP"), ["xmpp:jane@chat.example.org"]);
  assert.equal(values("ADR").length, 1);
  assert.deepEqual(values("ORG"), ["Example Co"]);
  assert.deepEqual(values("BDAY"), ["1990-01-02"]);
  assert.deepEqual(values("NOTE"), ["Met at the fair\\n\\nWorks at Example Co"]);
  assert.deepEqual(values("CATEGORIES"), ["Friends,Work"]);
  assert.deepEqual(values("GENDER"), ["F"]);
  // The URL comes over without its Apple group (its label would point nowhere).
  assert.deepEqual(getAll(merged, "URL").map((p) => p.raw), ["URL:https://example.org/jane/"]);
  assert.equal(getAll(merged, "X-ABLABEL").length, 0);
  // The kept card's photo, identity and other lines stay as they were.
  for (const line of ["PHOTO;VALUE=URL:data:image/png;base64,AAAA", "X-MOZILLA-HTML:TRUE", "UID:k", "N:Doe;Jane;;;"]) {
    assert.ok(text.includes(`${line}\r\n`), line);
  }
  assert.equal(getAll(merged, "UID").length, 1);
});

test("unpicked values are dropped, and (none) removes a single field", () => {
  const keeper = card(["FN:Jane Doe", "ORG:Old Co", "TEL:555-123-4567", "TEL:555-000-1111"], { id: "k" });
  const other = card(["FN:Jane Doe", "ORG:New Co"], { id: "o" });
  const options = mergeOptions([keeper, other]);
  const tel = options.multi.find((f) => f.name === "TEL");
  const text = mergeVCard([keeper, other], "k", { name: "Jane Doe", multi: { TEL: new Set([tel.values[1].key]) }, single: { ORG: "" }, note: "" });
  const merged = parseVCard(text);
  assert.deepEqual(getAll(merged, "TEL").map((p) => p.value), ["555-000-1111"]);
  assert.equal(first(merged, "ORG"), undefined);
});

test("the kept card gets a name and N from the others when it has none", () => {
  const keeper = card(["EMAIL:jane@example.org"], { id: "k" });
  const other = card(["FN:Jane Doe", "N:Doe;Jane;;;", "EMAIL:jane@example.org"], { id: "o" });
  const options = mergeOptions([keeper, other]);
  const multi = Object.fromEntries(options.multi.map((f) => [f.name, f.values.map((v) => v.key)]));
  const merged = readCard({ id: "k", vCard: mergeVCard([keeper, other], "k", { name: "Jane Doe", multi, single: {}, note: "" }) });
  assert.equal(merged.name, "Jane Doe");
  assert.equal(merged.nameParts.given, "Jane");
  assert.deepEqual(merged.emails.map((e) => e.address), ["jane@example.org"]);
});
