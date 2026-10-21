/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { vcard } from "./helpers.js";
import { cardModel, modelToVCard, newContactVCard, emptyModel, readDate, writeDate } from "../src/core/card-model.js";
import { parseVCard, getAll, first } from "../src/core/vcard.js";

const jane = vcard(
  "FN:Jane Example",
  "N:Example;Jane;Q;Dr.;",
  "TEL;TYPE=cell,voice;PREF=1:(555) 123-4567",
  "TEL;TYPE=work:555.987.6543",
  "EMAIL;TYPE=home:jane@example.org",
  "item1.IMPP:xmpp:jane@chat.example.org",
  "ADR;TYPE=home:;;1 Main St;Springfield;IL;62701;USA",
  "ORG:Example Co;Sales",
  "BDAY;VALUE=date:--03-04",
  "CATEGORIES:Family,Friends",
  "NOTE:Met at the fair",
  "PHOTO;VALUE=URL:data:image/png;base64,AAAA",
  "X-CUSTOM:kept",
  "UID:j",
);

test("a card reads into the editor's fields", () => {
  const m = cardModel(jane);
  assert.equal(m.fn, "Jane Example");
  assert.deepEqual([m.given, m.family, m.org], ["Jane", "Example", "Example Co"]);
  assert.deepEqual(m.phones.map((p) => [p.type, p.value]), [["cell", "(555) 123-4567"], ["work", "555.987.6543"]]);
  assert.deepEqual(m.emails.map((e) => [e.type, e.value]), [["home", "jane@example.org"]]);
  assert.deepEqual(m.chats.map((c) => c.value), ["xmpp:jane@chat.example.org"]);
  assert.deepEqual(m.addresses[0].parts, ["", "", "1 Main St", "Springfield", "IL", "62701", "USA"]);
  assert.deepEqual([m.bday, m.bdayNoYear], ["2000-03-04", true]);
  assert.equal(m.categories, "Family, Friends");
  assert.equal(m.note, "Met at the fair");
});

test("saving without changes gives the card back byte for byte", () => {
  assert.equal(modelToVCard(jane, cardModel(jane)), jane);
});

test("a changed value keeps its line's group and parameters; only what changed is rewritten", () => {
  const m = cardModel(jane);
  m.phones[0].value = "(555) 123-9999";
  m.chats[0].value = "jane@other.example.org";
  m.given = "Janet";
  m.org = "Example Inc";
  const v = parseVCard(modelToVCard(jane, m));
  assert.deepEqual(getAll(v, "TEL").map((p) => p.raw), ["TEL;TYPE=cell,voice;PREF=1:(555) 123-9999", "TEL;TYPE=work:555.987.6543"]);
  // A typed chat address without xmpp: gets it; the line keeps its group.
  assert.deepEqual(getAll(v, "IMPP").map((p) => p.raw), ["item1.IMPP:xmpp:jane@other.example.org"]);
  // The rest of N (middle name, prefix) and ORG's department stay.
  assert.equal(first(v, "N").raw, "N:Example;Janet;Q;Dr.;");
  assert.equal(first(v, "ORG").raw, "ORG:Example Inc;Sales");
  for (const kept of ["EMAIL;TYPE=home:jane@example.org", "BDAY;VALUE=date:--03-04", "PHOTO;VALUE=URL:data:image/png;base64,AAAA", "X-CUSTOM:kept", "UID:j"]) {
    assert.ok(v.props.some((p) => p.raw === kept), kept);
  }
});

test("types change, values are added and removed, dates and labels are written", () => {
  const m = cardModel(jane);
  m.phones[1].type = "home";
  m.phones.push({ type: "fax", value: "555 000 1111" });
  m.emails = [];
  m.urls.push({ value: "https://example.org" });
  m.bday = "1987-01-02";
  m.bdayNoYear = false;
  m.anniversary = "2000-06-15";
  m.anniversaryNoYear = true;
  m.categories = "Family, Work";
  m.note = "";
  const v = parseVCard(modelToVCard(jane, m));
  assert.deepEqual(getAll(v, "TEL").map((p) => p.raw), ["TEL;TYPE=cell,voice;PREF=1:(555) 123-4567", "TEL;TYPE=home:555.987.6543", "TEL;TYPE=fax:555 000 1111"]);
  assert.equal(getAll(v, "EMAIL").length, 0);
  assert.deepEqual(getAll(v, "URL").map((p) => p.value), ["https://example.org"]);
  assert.equal(first(v, "BDAY").raw, "BDAY;VALUE=date:1987-01-02");
  assert.equal(first(v, "ANNIVERSARY").raw, "ANNIVERSARY;VALUE=date:--06-15");
  assert.equal(first(v, "CATEGORIES").value, "Family,Work");
  assert.equal(getAll(v, "NOTE").length, 0);
});

test("a new contact: display name from first and last name when left empty", () => {
  const m = emptyModel();
  m.given = "Dana";
  m.family = "Example";
  m.phones.push({ type: "cell", value: "+1 555 999 0000" });
  m.chats.push({ value: "+15559990000@cheogram.com" });
  const v = parseVCard(newContactVCard(m));
  assert.equal(first(v, "FN").value, "Dana Example");
  assert.equal(first(v, "N").value, "Example;Dana;;;");
  assert.equal(first(v, "TEL").raw, "TEL;TYPE=cell:+1 555 999 0000");
  assert.equal(first(v, "IMPP").value, "xmpp:+15559990000@cheogram.com");
  assert.equal(v.props.at(-1).name, "END");
});

test("dates: with a year, without one, and unreadable", () => {
  assert.deepEqual(readDate("19870102"), { date: "1987-01-02", noYear: false });
  assert.deepEqual(readDate("--0304"), { date: "2000-03-04", noYear: true });
  assert.deepEqual(readDate("sometime"), { date: "", noYear: false });
  assert.equal(writeDate("2000-03-04", true), "--03-04");
  assert.equal(writeDate("", false), "");
});
