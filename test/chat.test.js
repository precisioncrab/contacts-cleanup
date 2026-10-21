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
import { parseVCard, serializeVCard, getAll } from "../src/core/vcard.js";

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

test("adding writes IMPP:xmpp: once, marked as Jabber; removing takes only that address", () => {
  const c = card(["FN:Jane Doe", "TEL:555-123-4567", "EMAIL:jane@example.org", "IMPP:xmpp:jane@chat.example.org"]);
  const added = addChatAddress(c.vCard, "+15551234567@cheogram.com");
  // X-SERVICE-TYPE=Jabber, or Google Contacts stores it as "Other" and sends it back as x-apple:.
  assert.ok(added.includes("\r\nIMPP;X-SERVICE-TYPE=Jabber:xmpp:+15551234567@cheogram.com\r\n"));
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

// A card the way Google Contacts sends it back after it stored a chat address as "Other" three times.
const googled = [
  "VERSION:3.0",
  "FN:Pat Roe",
  "TEL;TYPE=CELL,PREF:+1 555 666 7777",
  "item1.EMAIL;TYPE=PREF:pat@example.org",
  "ITEM2.IMPP;TYPE=PREF;X-SERVICE-TYPE=Other:x-apple:+15556667777@cheogram.com",
  "ITEM3.IMPP;X-SERVICE-TYPE=Other:x-apple:+15556667777@cheogram.com",
  "ITEM4.IMPP;X-SERVICE-TYPE=Other:x-apple:+15556667777@cheogram.com",
  "item1.X-ABLabel:",
  "ITEM2.X-ABLABEL:Other",
  "ITEM3.X-ABLABEL:Other",
  "ITEM4.X-ABLABEL:Other",
];

test("Google's x-apple: chat addresses count as the address: never added again", () => {
  const c = card(googled);
  assert.deepEqual(c.chat.map((x) => [x.kind, x.address]), [
    ["x-apple", "+15556667777@cheogram.com"], ["x-apple", "+15556667777@cheogram.com"], ["x-apple", "+15556667777@cheogram.com"],
  ]);
  assert.equal(addChatAddress(c.vCard, "+15556667777@cheogram.com"), c.vCard);
});

test("fixing x-apple: copies leaves one xmpp: line marked as Jabber, in the first copy's group; the rest go with their labels", () => {
  const c = card(googled);
  const fixes = prefixFixes(c);
  assert.deepEqual(fixes.map((f) => [f.kind, f.address, f.copies]), [["x-apple", "+15556667777@cheogram.com", 3]]);
  const fixed = parseVCard(applyPrefixFixes(c.vCard, fixes));
  assert.deepEqual(getAll(fixed, "IMPP").map((p) => p.raw), ["ITEM2.IMPP;TYPE=PREF;X-SERVICE-TYPE=Jabber:xmpp:+15556667777@cheogram.com"]);
  assert.deepEqual(getAll(fixed, "X-ABLABEL").map((p) => p.raw), ["item1.X-ABLabel:", "ITEM2.X-ABLABEL:Other"]);
  assert.deepEqual(prefixFixes(readCard({ id: "f", vCard: serializeVCard(fixed) })), []);
  // With the xmpp: line there already, the x-apple: copies just go.
  const both = card([...googled, "IMPP;X-SERVICE-TYPE=Jabber:xmpp:+15556667777@cheogram.com"]);
  const cleaned = parseVCard(applyPrefixFixes(both.vCard, prefixFixes(both)));
  assert.deepEqual(getAll(cleaned, "IMPP").map((p) => p.value), ["xmpp:+15556667777@cheogram.com"]);
});
