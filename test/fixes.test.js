/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { card } from "./helpers.js";
import { phoneFixes, applyPhoneFixes, proposeName, applyName } from "../src/core/fixes.js";
import { countryById } from "../src/core/phone.js";
import { parseVCard, getAll, first } from "../src/core/vcard.js";

test("phone fixes: what changes, and what's left alone", () => {
  const c = card([
    "FN:Jane Doe",
    "TEL;TYPE=cell;VALUE=TEXT:(555) 123-4567",
    "TEL:+1 555 987 6543",
    "TEL:555-111-2222 x45",
    "TEL:123-4567",
    "TEL;VALUE=URI:tel:555-333-4444",
  ]);
  const { fixes, skipped } = phoneFixes(c, { style: "international", country: countryById("nanp") });
  assert.deepEqual(fixes, [
    { index: 0, from: "(555) 123-4567", to: "+1 555 123 4567" },
    { index: 4, from: "tel:555-333-4444", to: "tel:+1-555-333-4444" },
  ]);
  assert.deepEqual(skipped.map((s) => [s.index, s.reason]), [[2, "extension"], [3, "unknown"]]);
});

test("applying phone fixes changes only those values, keeping each line's type", () => {
  const c = card(["FN:Jane Doe", "TEL;TYPE=cell;VALUE=TEXT:(555) 123-4567", "TEL:555-987-6543"]);
  const { fixes } = phoneFixes(c, { style: "compact", country: countryById("nanp") });
  const text = applyPhoneFixes(c.vCard, fixes.slice(0, 1));
  const tels = getAll(parseVCard(text), "TEL");
  assert.equal(tels[0].raw, "TEL;TYPE=cell;VALUE=TEXT:+15551234567");
  assert.equal(tels[1].raw, "TEL:555-987-6543");
});

test("a phone fix isn't made if the number changed since it was proposed", () => {
  const c = card(["TEL:(555) 123-4567"]);
  const text = applyPhoneFixes(c.vCard.replace("(555) 123-4567", "555 123 0000"), [{ index: 0, from: "(555) 123-4567", to: "+1 555 123 4567" }]);
  assert.equal(first(parseVCard(text), "TEL").value, "555 123 0000");
});

test("names: from N, organization, nickname, then the email address", () => {
  assert.deepEqual(proposeName(card(["N:Doe;Jane;;;"])), { name: "Jane Doe", source: "name", guess: false });
  assert.deepEqual(proposeName(card(["FN:+15551234567", "ORG:Example Co"])), { name: "Example Co", source: "organization", guess: false });
  assert.deepEqual(proposeName(card(["NICKNAME:JD"])), { name: "JD", source: "nickname", guess: false });
  assert.deepEqual(proposeName(card(["FN:jane.doe@example.org", "EMAIL:jane.doe@example.org"])), { name: "Jane Doe", source: "email", guess: false });
  assert.deepEqual(proposeName(card(["EMAIL:jdoe1987@example.org"])), { name: "Jdoe1987", source: "email", guess: true });
  assert.equal(proposeName(card(["FN:Jane Doe"])), null);
  assert.equal(proposeName(card(["TEL:555-123-4567"])), null);
});

test("applying a name sets FN, or adds it after VERSION", () => {
  const withFn = card(["FN:jane@example.org", "EMAIL:jane@example.org"]);
  assert.equal(first(parseVCard(applyName(withFn.vCard, "Jane; Doe")), "FN").raw, "FN:Jane\\; Doe");
  const without = card(["N:Doe;Jane;;;"]);
  const props = parseVCard(applyName(without.vCard, "Jane Doe")).props.map((p) => p.name);
  assert.equal(props.indexOf("FN"), props.indexOf("VERSION") + 1);
});
