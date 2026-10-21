/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { card } from "./helpers.js";
import { phoneOfChatAddress, linkFor, linkToCard, newCardFor, splitName, notInChat } from "../src/core/chat-list.js";
import { parseVCard, getAll, first } from "../src/core/vcard.js";
import { readCard } from "../src/core/card.js";

test("a JMP.chat or Quicksy address stands for its number; other addresses don't", () => {
  assert.equal(phoneOfChatAddress("+15556667777@cheogram.com"), "+15556667777");
  assert.equal(phoneOfChatAddress("+15556667777@quicksy.im"), "+15556667777");
  assert.equal(phoneOfChatAddress("friend@example.org"), null);
  assert.equal(phoneOfChatAddress("+15556667777"), null);
  assert.deepEqual(linkFor("+15556667777@cheogram.com"), { kind: "phone", e164: "+15556667777", text: "+1 555 666 7777" });
  assert.deepEqual(linkFor("Friend@Example.org"), { kind: "chat", address: "friend@example.org", text: "xmpp:friend@example.org" });
});

test("adding a chat contact to a card: the number for a JMP.chat address (OMEMO matches those by number), else the chat address", () => {
  const pat = card(["FN:Pat Roe", "EMAIL:pat@example.org"], { id: "p" });
  const withNumber = parseVCard(linkToCard(pat.vCard, "+15556667777@cheogram.com"));
  assert.deepEqual(getAll(withNumber, "TEL").map((p) => p.raw), ["TEL;TYPE=cell:+1 555 666 7777"]);
  assert.equal(getAll(withNumber, "IMPP").length, 0);
  const withAddress = parseVCard(linkToCard(pat.vCard, "pat@chat.example.org"));
  assert.deepEqual(getAll(withAddress, "IMPP").map((p) => p.value), ["xmpp:pat@chat.example.org"]);
  // Already there, in any format: the card comes back unchanged.
  const has = card(["FN:Sam Roe", "TEL;TYPE=home:(555) 666-7777", "IMPP:xmpp:sam@chat.example.org"], { id: "s" });
  assert.equal(linkToCard(has.vCard, "+15556667777@cheogram.com"), has.vCard);
  assert.equal(linkToCard(has.vCard, "Sam@Chat.Example.org"), has.vCard);
});

test("a new card for a chat contact gets the name, split into first and last, and what names it", () => {
  assert.deepEqual(splitName("Patricia Ann Roe"), { given: "Patricia Ann", family: "Roe" });
  assert.deepEqual(splitName("  Mom "), { given: "Mom", family: "" });
  const made = readCard({ id: "n", vCard: newCardFor("+15556667777@cheogram.com", "Patricia Roe") });
  assert.equal(made.name, "Patricia Roe");
  assert.deepEqual(made.nameParts.given, "Patricia");
  assert.deepEqual(made.nameParts.family, "Roe");
  assert.deepEqual(made.phones.map((p) => [p.e164, p.mobile]), [["+15556667777", true]]);
  const chat = parseVCard(newCardFor("friend@example.org", "A Friend; Esq."));
  assert.equal(first(chat, "FN").value, "A Friend\\; Esq.");
  assert.deepEqual(getAll(chat, "IMPP").map((p) => p.value), ["xmpp:friend@example.org"]);
});

test("cards not in a chat list: their own chat address first, else their number at the gateway, mobile first", () => {
  const cards = [
    card(["FN:In By Number", "TEL;TYPE=cell:555-666-7777"], { id: "a" }),
    card(["FN:In By Address", "IMPP:xmpp:friend@example.org"], { id: "b" }),
    card(["FN:In By Quicksy", "TEL;TYPE=cell:+1 555 111 2222"], { id: "c" }),
    card(["FN:Has Address", "TEL;TYPE=cell:555 333 4444", "IMPP:xmpp:+15553334444@cheogram.com", "IMPP:xmpp:has@example.org"], { id: "d" }),
    card(["FN:Home And Mobile", "TEL;TYPE=home:555 444 0000", "TEL;TYPE=cell:555 444 1111"], { id: "e" }),
    card(["FN:Email Only", "EMAIL:email.only@example.org"], { id: "f" }),
    card(["FN:No Country", "TEL;TYPE=cell:12345"], { id: "g" }),
  ];
  const chatList = ["+15556667777@cheogram.com", "Friend@Example.org", "+15551112222@quicksy.im"];
  const out = notInChat(cards, chatList, "cheogram.com");
  assert.deepEqual(out.map((o) => [o.card.id, o.jid, o.via]), [
    ["d", "has@example.org", "chat"],
    ["e", "+15554441111@cheogram.com", "phone"],
  ]);
  assert.equal(out[1].number, "555 444 1111");
});
