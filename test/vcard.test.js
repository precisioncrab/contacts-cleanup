/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVCard, serializeVCard, getAll, first, setValue, makeProp, insertProp, removeProp,
  typesOf, escapeText, unescapeText, splitStructured, comparable, withoutGroupAndParams,
} from "../src/core/vcard.js";

const SAMPLE = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Jane Doe",
  "N:Doe;Jane;;;",
  'item1.TEL;TYPE="cell,voice";VALUE=TEXT:(555) 123-4567',
  "item1.X-ABLabel:Mobile",
  "PHOTO;VALUE=URL:data:image/jpeg;base64,AAAA",
  "X-CUSTOM;X-PARAM=a:b:c",
  "UID:abc-123",
  "END:VCARD",
].join("\r\n") + "\r\n";

test("an untouched vCard comes back byte for byte", () => {
  assert.equal(serializeVCard(parseVCard(SAMPLE)), SAMPLE);
});

test("folded lines are unfolded", () => {
  const card = parseVCard("BEGIN:VCARD\r\nNOTE:a long\r\n  note\r\n\tcontinued\r\nEND:VCARD\r\n");
  assert.equal(first(card, "NOTE").value, "a long notecontinued");
});

test("properties: groups, names, parameters, values with colons", () => {
  const card = parseVCard(SAMPLE);
  const tel = first(card, "TEL");
  assert.equal(tel.group, "item1");
  assert.equal(tel.value, "(555) 123-4567");
  assert.deepEqual(typesOf(tel), ["cell", "voice"]);
  assert.equal(first(card, "X-CUSTOM").value, "b:c");
  assert.equal(first(card, "PHOTO").value, "data:image/jpeg;base64,AAAA");
});

test("bare vCard 2.1 parameters count as TYPE", () => {
  const card = parseVCard("BEGIN:VCARD\nTEL;CELL;VOICE:555 1234\nEND:VCARD");
  assert.deepEqual(typesOf(first(card, "TEL")), ["cell", "voice"]);
});

test("setValue keeps the group and parameters exactly as written", () => {
  const card = parseVCard(SAMPLE);
  setValue(first(card, "TEL"), "+1 555 123 4567");
  assert.equal(first(card, "TEL").raw, 'item1.TEL;TYPE="cell,voice";VALUE=TEXT:+1 555 123 4567');
  // Everything else is unchanged.
  const before = SAMPLE.split("\r\n").filter((l) => !l.includes("TEL"));
  const after = serializeVCard(card).split("\r\n").filter((l) => !l.includes("TEL"));
  assert.deepEqual(after, before);
});

test("insertProp goes after the last property of its kind, else before END", () => {
  const card = parseVCard(SAMPLE);
  insertProp(card, makeProp("TEL", "+15559876543"));
  insertProp(card, makeProp("IMPP", "xmpp:jane@example.org"));
  const names = card.props.map((p) => p.name);
  assert.equal(names.indexOf("TEL") + 1, names.lastIndexOf("TEL"));
  assert.equal(names.at(-2), "IMPP");
  assert.equal(names.at(-1), "END");
});

test("insertProp after a named property when there's none of its kind", () => {
  const card = parseVCard(SAMPLE);
  insertProp(card, makeProp("NICKNAME", "JD"), "N");
  const names = card.props.map((p) => p.name);
  assert.equal(names.indexOf("NICKNAME"), names.indexOf("N") + 1);
});

test("removeProp and getAll", () => {
  const card = parseVCard(SAMPLE);
  removeProp(card, first(card, "PHOTO"));
  assert.equal(getAll(card, "PHOTO").length, 0);
  assert.equal(getAll(card, "tel").length, 1);
});

test("makeProp quotes parameter values with separators", () => {
  assert.equal(makeProp("TEL", "1", [{ key: "TYPE", value: "cell,voice" }]).raw, 'TEL;TYPE="cell,voice":1');
});

test("withoutGroupAndParams drops the group and the named parameters", () => {
  const card = parseVCard("BEGIN:VCARD\nitem2.EMAIL;PREF=1;TYPE=work:a@example.org\nEND:VCARD");
  assert.equal(withoutGroupAndParams(first(card, "EMAIL"), ["PREF"]).raw, "EMAIL;TYPE=work:a@example.org");
});

test("text escaping round-trips", () => {
  const text = "Smith, Jones; and\\or\nnext line";
  assert.equal(unescapeText(escapeText(text)), text);
  assert.deepEqual(splitStructured("Doe;Jane\\, Jr.;;;"), ["Doe", "Jane, Jr.", "", "", ""]);
});

test("comparable ignores REV and PRODID", () => {
  const a = "BEGIN:VCARD\r\nFN:A\r\nREV:1\r\nEND:VCARD\r\n";
  const b = "BEGIN:VCARD\r\nPRODID:x\r\nFN:A\r\nREV:2\r\nEND:VCARD\r\n";
  assert.equal(comparable(a), comparable(b));
});

test("photo lines: read, left out, put back; comparing ignores the photo", async () => {
  const { photoLines, withoutPhoto, withPhoto } = await import("../src/core/vcard.js");
  assert.equal(photoLines(SAMPLE), "PHOTO;VALUE=URL:data:image/jpeg;base64,AAAA");
  const bare = withoutPhoto(SAMPLE);
  assert.equal(photoLines(bare), "");
  assert.equal(photoLines(withPhoto(bare, photoLines(SAMPLE))), "PHOTO;VALUE=URL:data:image/jpeg;base64,AAAA");
  assert.equal(withPhoto(bare, ""), bare);
  assert.equal(comparable(SAMPLE), comparable(bare));
});
