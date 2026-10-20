/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { phoneNumber, formatPhone, writeNumber, countryCode, phoneKey, countryById, hasExtension } from "../src/core/phone.js";

test("any US/Canada format reads as +1 (OMEMO for Thunderbird's rules)", () => {
  for (const value of ["(555) 123-4567", "555.123.4567", "555 123 4567", "1-555-123-4567", "+1 555 123 4567", "tel:+1-555-123-4567", "001 555 123 4567"]) {
    assert.equal(phoneNumber(value), "+15551234567", value);
  }
});

test("numbers that can't be told are null", () => {
  for (const value of ["123-4567", "0555 123 4567", "call me", "", null]) {
    assert.equal(phoneNumber(value), null, String(value));
  }
});

test("international numbers keep their country code", () => {
  assert.equal(phoneNumber("+44 20 7946 0958"), "+442079460958");
  assert.equal(phoneNumber("0044 20 7946 0958"), "+442079460958");
  assert.equal(phoneNumber("+44 (0)20 7946 0958"), "+442079460958");
});

test("a default country reads national numbers with its trunk prefix", () => {
  const gb = countryById("gb");
  assert.equal(phoneNumber("020 7946 0958", gb), "+442079460958");
  assert.equal(phoneNumber("07911 123456", gb), "+447911123456");
  assert.equal(phoneNumber("555 123 4567", gb), null);
  assert.equal(phoneNumber("+1 555 123 4567", gb), "+15551234567");
  assert.equal(phoneNumber("555 123 4567", countryById("none")), null);
  assert.equal(phoneNumber("1 555 123 4567", countryById("none")), null);
});

test("extensions", () => {
  assert.equal(hasExtension("555-123-4567 x12"), true);
  assert.equal(hasExtension("555-123-4567 ext. 12"), true);
  assert.equal(hasExtension("tel:+15551234567;ext=12"), true);
  assert.equal(hasExtension("+1 555 123 4567"), false);
  assert.deepEqual(formatPhone("555-123-4567 x12"), { skip: "extension" });
});

test("country codes are found by prefix", () => {
  assert.equal(countryCode("+15551234567"), "1");
  assert.equal(countryCode("+79123456789"), "7");
  assert.equal(countryCode("+442079460958"), "44");
  assert.equal(countryCode("+353861234567"), "353");
  assert.equal(countryCode("+861012345678"), "86");
});

test("writing numbers", () => {
  assert.equal(writeNumber("+15551234567"), "+1 555 123 4567");
  assert.equal(writeNumber("+15551234567", "compact"), "+15551234567");
  assert.equal(writeNumber("+442079460958"), "+44 207 946 0958");
  assert.equal(writeNumber("+353861234567"), "+353 861 234 567");
  assert.equal(writeNumber("+15551234567", "international", "-"), "+1-555-123-4567");
});

test("formatPhone: text values and tel: links", () => {
  assert.deepEqual(formatPhone("(555) 123-4567"), { value: "+1 555 123 4567", e164: "+15551234567" });
  assert.deepEqual(formatPhone("(555) 123-4567", { style: "compact" }), { value: "+15551234567", e164: "+15551234567" });
  assert.deepEqual(formatPhone("tel:555-123-4567"), { value: "tel:+1-555-123-4567", e164: "+15551234567" });
  assert.deepEqual(formatPhone("123-4567"), { skip: "unknown" });
  // Already right: the same value comes back.
  assert.equal(formatPhone("+1 555 123 4567").value, "+1 555 123 4567");
});

test("outside US and Canada, the grouping the user typed is kept", () => {
  const gb = { country: countryById("gb") };
  assert.equal(formatPhone("+44 20 7946 0958").value, "+44 20 7946 0958");
  assert.equal(formatPhone("0044 20 7946 0958").value, "+44 20 7946 0958");
  assert.equal(formatPhone("+44 (0)20 7946-0958").value, "+44 20 7946 0958");
  assert.equal(formatPhone("+4420 7946 0958").value, "+44 20 7946 0958");
  assert.equal(formatPhone("020 7946 0958", gb).value, "+44 20 7946 0958");
  assert.equal(formatPhone("tel:+44-20-7946-0958").value, "tel:+44-20-7946-0958");
  // Written as one block: the simple grouping.
  assert.equal(formatPhone("+442079460958").value, "+44 207 946 0958");
  // US and Canada always 3-3-4, however typed.
  assert.equal(formatPhone("+1 5551 234 567").value, "+1 555 123 4567");
});

test("phoneKey matches numbers across formats, and short numbers by their digits", () => {
  assert.equal(phoneKey("(555) 123-4567"), phoneKey("+1 555 123 4567"));
  assert.equal(phoneKey("0555 123 4567"), "#5551234567");
  assert.equal(phoneKey("123"), null);
});
