/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { card } from "./helpers.js";
import { findDuplicates, mergeOptions, mergeVCard, nameKey, pairKey, namesCompatible, groupLinks, suggestPeople } from "../src/core/duplicates.js";
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

test("the same person in two address books isn't a duplicate, unless asked", () => {
  const home = card(["FN:Jane Doe", "EMAIL:jane@example.org"], { id: "home", parentId: "book-1" });
  const work = card(["FN:Jane Doe", "EMAIL:jane@example.org"], { id: "work", parentId: "book-2", book: "Work" });
  const homeAgain = card(["FN:Jane D", "EMAIL:jane@example.org"], { id: "home2", parentId: "book-1" });
  assert.deepEqual(ids(findDuplicates([home, work, homeAgain])), [["home", "home2"]]);
  assert.deepEqual(findDuplicates([home, work, homeAgain])[0].reasons, ["same email"]);
  assert.deepEqual(ids(findDuplicates([home, work, homeAgain], new Set(), { acrossBooks: true })), [["home", "home2", "work"]]);
  assert.deepEqual(findDuplicates([home, work], new Set(), { acrossBooks: true })[0].reasons, ["same email", "same name"]);
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

test("names that could be one person, and names that can't", () => {
  const c = (name, extra = []) => card([`FN:${name}`, ...extra]);
  assert.equal(namesCompatible(c("Sam Roe"), c("Sammy Roe")), true);
  assert.equal(namesCompatible(c("Jane Doe"), c("J Doe")), true);
  assert.equal(namesCompatible(c("Jane Doe"), c("Doe, Jane")), true);
  assert.equal(namesCompatible(c("Jane Doe"), c("jane@example.org", ["EMAIL:jane@example.org"])), true);
  assert.equal(namesCompatible(c("Sam Roe"), c("Pat Roe")), false);
  assert.equal(namesCompatible(c("Jane Doe"), c("Example Co")), false);
  // N's given name counts over the display name's first word.
  assert.equal(namesCompatible(card(["FN:Dr. Kim Lee", "N:Lee;Kim;;Dr.;"]), c("Kim Lee")), true);
});

test("links say what each pair shares", () => {
  const a = card(["FN:Sam Roe", "TEL:(555) 222-3333", "EMAIL:roes@example.org"], { id: "a" });
  const b = card(["FN:Pat Roe", "TEL:+1 555 222 3333"], { id: "b" });
  const c = card(["FN:Lee Poe"], { id: "c" });
  assert.deepEqual(groupLinks([a, b, c]).map((l) => [l.a.id, l.b.id, l.shared]), [["a", "b", [{ kind: "phone", value: "(555) 222-3333" }]]]);
});

test("a household and a shared name chain into one group, and are sorted into people", () => {
  // One group: Sam (2 cards) and Pat share the house phone; a second Pat Roe card has Pat's email.
  const sam1 = card(["FN:Sam Roe", "TEL;TYPE=home:555-222-3333", "EMAIL:sam@example.org"], { id: "sam1" });
  const sam2 = card(["FN:Sammy Roe", "EMAIL:sam@example.org"], { id: "sam2" });
  const pat1 = card(["FN:Pat Roe", "TEL;TYPE=home:(555) 222-3333"], { id: "pat1" });
  const pat2 = card(["FN:Pat Roe", "EMAIL:pat@example.org"], { id: "pat2" });
  const kid = card(["FN:Alex Roe", "TEL:555-222-3333"], { id: "kid" });
  const groups = findDuplicates([sam1, sam2, pat1, pat2, kid]);
  assert.equal(groups.length, 1);
  const assign = suggestPeople(groups[0].cards);
  assert.equal(assign.sam1, assign.sam2);
  assert.equal(assign.pat1, assign.pat2);
  assert.notEqual(assign.sam1, assign.pat1);
  assert.notEqual(assign.kid, assign.sam1);
  assert.notEqual(assign.kid, assign.pat1);
  assert.deepEqual(new Set(Object.values(assign)), new Set([1, 2, 3]));
});

test("cards without a name don't glue different people together", () => {
  // 10 cards, 3 people. The nameless cards share details with two people each.
  const cards = [
    card(["FN:Jane Roe", "EMAIL:jane@example.org", "TEL:555-111-0001"], { id: "jane1" }),
    card(["FN:Jane R", "EMAIL:jane@example.org"], { id: "jane2" }),
    card(["FN:Jane Roe", "TEL:555-111-0001"], { id: "jane3" }),
    card(["FN:John Roe", "EMAIL:john@example.org", "TEL:555-111-0002"], { id: "john1" }),
    card(["FN:Johnny Roe", "EMAIL:john@example.org"], { id: "john2" }),
    card(["FN:Kim Lee", "EMAIL:kim@example.org", "TEL:555-111-0003"], { id: "kim1" }),
    card(["FN:Kim Lee", "TEL:(555) 111-0003"], { id: "kim2" }),
    // No names: Jane's email and John's number; John's email and Kim's number.
    card(["EMAIL:jane@example.org", "TEL:555-111-0002"], { id: "glue1" }),
    card(["EMAIL:john@example.org", "TEL:555-111-0003"], { id: "glue2" }),
    // "J Roe" fits Jane and John alike.
    card(["FN:J Roe", "TEL:555-111-0001", "EMAIL:john@example.org"], { id: "j" }),
  ];
  const groups = findDuplicates(cards);
  assert.equal(groups.length, 1);
  const assign = suggestPeople(groups[0].cards);
  const person = (...ids) => new Set(ids.map((id) => assign[id]));
  assert.equal(person("jane1", "jane2", "jane3").size, 1);
  assert.equal(person("john1", "john2").size, 1);
  assert.equal(person("kim1", "kim2").size, 1);
  assert.equal(person("jane1", "john1", "kim1").size, 3);
  // Each nameless card joins one person through its email (the strongest match), never two.
  assert.equal(assign.glue1, assign.jane1);
  assert.equal(assign.glue2, assign.john1);
  assert.ok([assign.jane1, assign.john1].includes(assign.j));
  assert.equal(new Set(Object.values(assign)).size, 3);
});

test("a one-word name alone isn't enough to call it one person", () => {
  const a = card(["FN:Mom", "EMAIL:mom@example.org"], { id: "a" });
  const b = card(["FN:Mom", "TEL:555-111-2222"], { id: "b" });
  const assign = suggestPeople(findDuplicates([a, b])[0].cards);
  assert.notEqual(assign.a, assign.b);
  const c = card(["FN:Jane Doe"], { id: "c" });
  const d = card(["FN:Jane Doe"], { id: "d" });
  const both = suggestPeople([c, d]);
  assert.equal(both.c, both.d);
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

test("the merged card can be renamed: display, first and last name", () => {
  const keeper = card(["FN:J Doe", "N:Doe;J;;Dr.;", "EMAIL:jane@example.org"], { id: "k" });
  const other = card(["FN:Jane Doe", "EMAIL:jane@example.org"], { id: "o" });
  const multi = { EMAIL: ["jane@example.org"] };
  const merged = readCard({ id: "k", vCard: mergeVCard([keeper, other], "k", { name: "Janie Doe-Smith", given: "Janie", family: "Doe-Smith", multi, single: {}, note: "" }) });
  assert.equal(merged.name, "Janie Doe-Smith");
  assert.deepEqual(merged.nameParts, { family: "Doe-Smith", given: "Janie", additional: "", prefix: "Dr.", suffix: "" });
  // A card with no N gets one when a first or last name is typed.
  const bare = card(["FN:Kim", "EMAIL:kim@example.org"], { id: "b" });
  const bare2 = card(["FN:Kim", "EMAIL:kim@example.org"], { id: "b2" });
  const named = readCard({ id: "b", vCard: mergeVCard([bare, bare2], "b", { name: "Kim Lee", given: "Kim", family: "Lee", multi: { EMAIL: ["kim@example.org"] }, single: {}, note: "" }) });
  assert.deepEqual([named.nameParts.given, named.nameParts.family], ["Kim", "Lee"]);
  // Typed single fields (organization) are written as typed.
  const org = readCard({ id: "b", vCard: mergeVCard([bare, bare2], "b", { name: "Kim", multi: { EMAIL: ["kim@example.org"] }, single: { ORG: "New Co" }, note: "" }) });
  assert.equal(org.org, "New Co");
});

test("values can be edited, emptied and added while merging; each line keeps its type", () => {
  const keeper = card(["FN:Jane Doe", "TEL;TYPE=cell:(555) 123-4567", "EMAIL:jane@example.org", "ADR;TYPE=home:;;1 Main St;Springfield;IL;55555;USA"], { id: "k" });
  const other = card(["FN:Jane Doe", "TEL;TYPE=work:555-987-6543", "URL:https://example.org/old"], { id: "o" });
  const options = mergeOptions([keeper, other]);
  const key = (name, text) => options.multi.find((f) => f.name === name).values.find((v) => v.text.startsWith(text)).key;
  const adr = options.multi.find((f) => f.name === "ADR").values[0];
  assert.deepEqual(adr.parts, ["", "", "1 Main St", "Springfield", "IL", "55555", "USA"]);
  assert.equal(options.multi.find((f) => f.name === "TEL").values[0].type, "cell");
  const multi = Object.fromEntries(options.multi.map((f) => [f.name, f.values.map((v) => v.key)]));
  const text = mergeVCard([keeper, other], "k", {
    name: "Jane Doe",
    multi,
    single: {},
    note: "",
    edits: {
      TEL: { [key("TEL", "(555)")]: "+1 555 123 9999", [key("TEL", "555-987")]: "+1 555 987 0000" },
      ADR: { [adr.key]: ["", "", "2 Oak Ave, Apt 3", "Springfield", "IL", "55556", "USA"] },
      URL: { [key("URL", "https")]: "  " },
    },
    added: {
      TEL: [{ value: "555-222-1111", type: "home" }, { value: "", type: "work" }],
      EMAIL: [{ value: "jane.doe@work.example.org", type: "work" }],
    },
  });
  const merged = parseVCard(text);
  assert.deepEqual(getAll(merged, "TEL").map((p) => p.raw), [
    "TEL;TYPE=cell:+1 555 123 9999",
    "TEL;TYPE=work:+1 555 987 0000",
    "TEL;TYPE=home:555-222-1111",
  ]);
  assert.deepEqual(getAll(merged, "ADR").map((p) => p.raw), ["ADR;TYPE=home:;;2 Oak Ave\\, Apt 3;Springfield;IL;55556;USA"]);
  assert.deepEqual(getAll(merged, "EMAIL").map((p) => p.raw), ["EMAIL:jane@example.org", "EMAIL;TYPE=work:jane.doe@work.example.org"]);
  assert.equal(getAll(merged, "URL").length, 0);
  // Read back, the edited address has its parts.
  assert.equal(readCard({ id: "k", vCard: text }).phones.length, 3);
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
