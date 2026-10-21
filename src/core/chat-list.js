/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The Chat page's address book side, for one chat account's contact list
 * (the chat contacts OMEMO for Thunderbird reports):
 *   - a chat contact the address book can't name gets onto a card, so
 *     OMEMO can name it: its phone number for a JMP.chat or Quicksy
 *     address (OMEMO matches those by number only), else its chat address;
 *   - the cards that aren't in the chat list yet, for Add to chat (OMEMO
 *     Pro).
 * Matching follows OMEMO for Thunderbird's own (its src/contacts/cards.js).
 */

import { parseVCard, serializeVCard, getAll, makeProp, insertProp, escapeText, unescapeText } from "./vcard.js";
import { xmppAddress } from "./card.js";
import { phoneNumber, writeNumber } from "./phone.js";
import { jmpAddress, phoneChoices, DEFAULT_GATEWAY } from "./chat.js";

/** The phone number a chat address stands for ("+15551234567@cheogram.com" -> "+15551234567"), or null. */
export function phoneOfChatAddress(jid) {
  const text = String(jid ?? "");
  const node = text.split("@")[0];
  return text.includes("@") && /^\+\d{7,15}$/.test(node) ? node : null;
}

/**
 * What a card needs for OMEMO to name this chat contact:
 * { kind: "phone", e164, text } or { kind: "chat", address, text }.
 */
export function linkFor(jid) {
  const phone = phoneOfChatAddress(jid);
  if (phone) {
    return { kind: "phone", e164: phone, text: writeNumber(phone) };
  }
  const address = String(jid).trim().toLowerCase();
  return { kind: "chat", address, text: `xmpp:${address}` };
}

/** The vCard with what names this chat contact added: a mobile number, or a chat address. Unchanged when the card has it. */
export function linkToCard(vCard, jid) {
  const vcard = parseVCard(vCard);
  const link = linkFor(jid);
  if (link.kind === "phone") {
    if (!getAll(vcard, "TEL").some((p) => phoneNumber(unescapeText(p.value)) === link.e164)) {
      insertProp(vcard, makeProp("TEL", link.text, [{ key: "TYPE", value: "cell" }]), "N");
    }
  } else if (!getAll(vcard, "IMPP").some((p) => xmppAddress(unescapeText(p.value)) === link.address)) {
    insertProp(vcard, makeProp("IMPP", link.text), "EMAIL");
  }
  return serializeVCard(vcard);
}

/** First and last name from a typed name: the last word is the last name ("Patricia Ann Roe" -> "Patricia Ann", "Roe"). */
export function splitName(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? { given: words.slice(0, -1).join(" "), family: words.at(-1) } : { given: words[0] ?? "", family: "" };
}

/** A new card for a chat contact: the name typed, and what names the contact. */
export function newCardFor(jid, name) {
  const { given, family } = splitName(name);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:4.0",
    `FN:${escapeText(name.trim())}`,
    `N:${escapeText(family)};${escapeText(given)};;;`,
    "END:VCARD",
  ];
  return linkToCard(`${lines.join("\r\n")}\r\n`, jid);
}

/**
 * The cards that aren't in a chat list yet: [{ card, jid, via, number }].
 * A card is in it when one of its chat addresses is, or when a chat
 * contact's phone number (a JMP.chat or Quicksy address) is one of the
 * card's numbers. Otherwise it's offered with its own chat address
 * (`via` "chat"), else its first number, mobile first, at the gateway
 * (`via` "phone", with the number as written).
 */
export function notInChat(cards, contactJids, gateway = DEFAULT_GATEWAY) {
  const jids = new Set(contactJids.map((j) => String(j).toLowerCase()));
  const phones = new Set(contactJids.map(phoneOfChatAddress).filter(Boolean));
  const out = [];
  for (const card of cards) {
    const own = [...new Set(card.chat.filter((c) => c.kind === "xmpp").map((c) => c.address))];
    const inChat = own.some((a) => jids.has(a) || phones.has(phoneOfChatAddress(a)))
      || card.phones.some((p) => p.e164 && phones.has(p.e164));
    if (inChat) {
      continue;
    }
    // A plain chat address before one that's a phone number.
    const address = own.find((a) => !phoneOfChatAddress(a)) ?? own[0];
    if (address) {
      out.push({ card, jid: address, via: "chat" });
      continue;
    }
    const choice = phoneChoices(card)[0];
    if (choice) {
      out.push({ card, jid: jmpAddress(choice.e164, gateway), via: "phone", number: choice.value });
    }
  }
  return out;
}
