/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { card } from "./helpers.js";
import { label, initials, xmppAddress, bareAddress, isRealName } from "../src/core/card.js";

test("reads names, numbers, emails and chat addresses", () => {
  const c = card([
    "FN:Jane Doe",
    "N:Doe;Jane;;;",
    "ORG:Example Co;Sales",
    "TEL;TYPE=cell:(555) 123-4567",
    "TEL;TYPE=work:555-987-6543",
    "EMAIL:Jane@Example.org",
    "IMPP:xmpp:jane@chat.example.org",
    "IMPP:jane2@chat.example.org",
    "X-JABBER:jane3@chat.example.org",
    "IMPP:sip:jane@example.org",
  ]);
  assert.equal(c.name, "Jane Doe");
  assert.deepEqual(c.nameParts, { family: "Doe", given: "Jane", additional: "", prefix: "", suffix: "" });
  assert.equal(c.org, "Example Co");
  assert.deepEqual(c.phones.map((p) => [p.e164, p.mobile]), [["+15551234567", true], ["+15559876543", false]]);
  assert.deepEqual(c.emails.map((e) => e.address), ["jane@example.org"]);
  assert.deepEqual(c.chat.map((x) => [x.address, x.kind]), [
    ["jane@chat.example.org", "xmpp"],
    ["jane2@chat.example.org", "noscheme"],
    ["jane3@chat.example.org", "x-jabber"],
  ]);
  assert.equal(c.hasPhoto, false);
});

test("xmpp: URIs and bare addresses", () => {
  assert.equal(xmppAddress("xmpp:+15551234567@cheogram.com"), "+15551234567@cheogram.com");
  assert.equal(xmppAddress("xmpp:Alice@Example.org/phone?message"), "alice@example.org");
  assert.equal(xmppAddress("alice@example.org"), null);
  assert.equal(bareAddress("mailto:a@example.org"), "a@example.org");
  assert.equal(bareAddress("not an address"), null);
});

test("labels and initials", () => {
  assert.equal(label(card(["N:Doe;Jane;;;"])), "Jane Doe");
  assert.equal(label(card(["FN:jane@example.org", "EMAIL:jane@example.org"])), "jane@example.org");
  assert.equal(label(card(["ORG:Example Co"])), "Example Co");
  assert.equal(label(card(["TEL:555-123-4567"])), "555-123-4567");
  assert.equal(label(card([])), "(no name)");
  assert.equal(initials(card(["FN:Jane Doe"])), "JD");
  assert.equal(initials(card(["N:Doe;Jane;;;"])), "JD");
  assert.equal(isRealName("+1 555 123 4567"), false);
  assert.equal(isRealName("Ana"), true);
});
