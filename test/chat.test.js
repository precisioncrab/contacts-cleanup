/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { card } from "./helpers.js";
import {
  normalizeGateway, jmpAddress, phoneChoices, chatState, addChatAddress, removeChatAddress, prefixFixes, applyPrefixFixes,
} from "../src/core/chat.js";
import { readCard } from "../src/core/card.js";
import { parseVCard, getAll } from "../src/core/vcard.js";

test("gateways as typed", () => {
  assert.equal(normalizeGateway(" @Cheogram.com "), "cheogram.com");
  assert.equal(normalizeGateway("xmpp:cheogram.com"), "cheogram.com");
  assert.equal(normalizeGateway("not a domain"), null);
  assert.equal(jmpAddress("+15551234567"), "+15551234567@cheogram.com");
});

test("phone choices: mobile first, each number once, only numbers with a country", () => {
  const c = card(["TEL;TYPE=work:555-987-6543", "TEL;TYPE=cell:(555) 123-4567", "TEL:+1 555 123 4567", "TEL:123-4567"]);
  assert.deepEqual(phoneChoices(c).map((p) => [p.e164, p.mobile]), [["+15551234567", true], ["+15559876543", false]]);
});

test("states: none, ours, theirs, no-phone", () => {
  assert.equal(chatState(card(["TEL:555-123-4567"])).state, "none");
  assert.equal(chatState(card(["TEL:123-4567"])).state, "no-phone");
  const theirs = card(["TEL:555-123-4567", "IMPP:xmpp:+15551234567@cheogram.com"]);
  assert.equal(chatState(theirs).state, "theirs");
  assert.equal(chatState(theirs, ["+15551234567@cheogram.com"]).state, "ours");
  // A recorded address that's no longer on the card doesn't count.
  assert.equal(chatState(card(["TEL:555-123-4567"]), ["+15551234567@cheogram.com"]).state, "none");
  // Chat addresses Thunderbird can't use still count as having one.
  assert.equal(chatState(card(["TEL:555-123-4567", "X-JABBER:jane@example.org"])).state, "theirs");
});

test("adding writes IMPP:xmpp: once; removing takes only that address", () => {
  const c = card(["FN:Jane Doe", "TEL:555-123-4567", "EMAIL:jane@example.org", "IMPP:xmpp:jane@chat.example.org"]);
  const added = addChatAddress(c.vCard, "+15551234567@cheogram.com");
  assert.ok(added.includes("\r\nIMPP:xmpp:+15551234567@cheogram.com\r\n"));
  assert.equal(addChatAddress(added, "+15551234567@cheogram.com"), added);
  const removed = removeChatAddress(added, "+15551234567@cheogram.com");
  assert.deepEqual(getAll(parseVCard(removed), "IMPP").map((p) => p.value), ["xmpp:jane@chat.example.org"]);
  assert.equal(readCard({ id: "x", vCard: added }).chat.length, 2);
});

test("prefix fixes: an address without xmpp: gets it; X-JABBER gets an IMPP line", () => {
  const c = card(["FN:Jane Doe", "IMPP:jane@chat.example.org", "X-JABBER:jane2@chat.example.org", "X-JABBER:jane3@chat.example.org", "IMPP:xmpp:jane3@chat.example.org"]);
  const fixes = prefixFixes(c);
  assert.deepEqual(fixes.map((f) => [f.kind, f.address]), [["noscheme", "jane@chat.example.org"], ["x-jabber", "jane2@chat.example.org"]]);
  const fixed = parseVCard(applyPrefixFixes(c.vCard, fixes));
  assert.deepEqual(getAll(fixed, "IMPP").map((p) => p.value).sort(), ["xmpp:jane2@chat.example.org", "xmpp:jane3@chat.example.org", "xmpp:jane@chat.example.org"]);
  assert.equal(getAll(fixed, "X-JABBER").length, 2);
  assert.deepEqual(prefixFixes(readCard({ id: "y", vCard: applyPrefixFixes(c.vCard, fixes) })), []);
});
