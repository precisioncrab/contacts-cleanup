/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Duplicate cards, and merging them.
 *
 * Two cards look like the same person when they share an email address, a
 * phone number (any format), a chat address, or a name (case, accents,
 * punctuation and word order aside). Linked cards form a group, and links
 * chain: a household phone and a shared name can put several people in one
 * group. So a group is sorted into people before merging: suggestPeople()
 * starts from the strong links only (see strongLink()), and the user moves
 * cards between people. Each person's cards merge into one card; cards of
 * different people are marked "not duplicates" so they don't group again.
 * Nothing is merged here: the user picks what each merged card keeps.
 *
 * A merge edits the kept card's vCard line by line (src/core/vcard.js), so
 * whatever it holds that isn't listed for picking (a photo, custom fields)
 * stays as it was; the other cards' fields the kept card doesn't have are
 * added to it.
 */

import {
  parseVCard, parseLine, serializeVCard, getAll, first, setValue, makeProp, insertProp, removeProp,
  withoutGroupAndParams, unescapeText, escapeText, splitStructured,
} from "./vcard.js";
import { isRealName, label, nameFromParts } from "./card.js";
import { phoneKey } from "./phone.js";

/** "Jöhn  O'Brien" and "o'brien, john" -> "brien john o". */
export function nameKey(name) {
  const words = String(name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.sort().join(" ");
}

/** An order-free key for a pair of card ids, for "Not duplicates". */
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const REASONS = { e: "same email", p: "same phone number", x: "same chat address", n: "same name" };

/** The match keys of a card ("e:", "p:", "x:" and "n:" prefixed), each to the value as the card shows it. */
function keysOf(card) {
  const keys = new Map();
  for (const e of card.emails) {
    keys.set(`e:${e.address}`, e.address);
  }
  for (const p of card.phones) {
    if (p.key && !keys.has(`p:${p.key}`)) {
      keys.set(`p:${p.key}`, p.value);
    }
  }
  for (const c of card.chat) {
    keys.set(`x:${c.address}`, c.address);
  }
  const name = label(card);
  if (isRealName(name) && nameKey(name)) {
    keys.set(`n:${nameKey(name)}`, name);
  }
  return keys;
}

/**
 * Groups of cards that look like the same person, biggest first:
 * [{ cards, reasons }]. `cards` are read cards (src/core/card.js);
 * read-only ones are left out. `dismissed` holds pairKey()s.
 */
export function findDuplicates(cards, dismissed = new Set()) {
  const live = cards.filter((c) => !c.readOnly);
  const keys = live.map(keysOf);
  const buckets = new Map();
  live.forEach((_, i) => {
    for (const key of keys[i].keys()) {
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push(i);
    }
  });

  const parent = live.map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const members of buckets.values()) {
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        if (!dismissed.has(pairKey(live[members[a]].id, live[members[b]].id))) {
          parent[find(members[a])] = find(members[b]);
        }
      }
    }
  }

  const groups = new Map();
  live.forEach((card, i) => {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root).push(i);
  });

  const result = [];
  for (const members of groups.values()) {
    if (members.length < 2) {
      continue;
    }
    const reasons = new Set();
    for (const [key, inBucket] of buckets) {
      if (inBucket.filter((i) => members.includes(i)).length >= 2) {
        reasons.add(REASONS[key[0]]);
      }
    }
    result.push({
      cards: members.map((i) => live[i]).sort((a, b) => label(a).localeCompare(label(b))),
      reasons: Object.values(REASONS).filter((r) => reasons.has(r)),
    });
  }
  return result.sort((a, b) => b.cards.length - a.cards.length || label(a.cards[0]).localeCompare(label(b.cards[0])));
}

/** A name's words: lowercase, accents and punctuation gone, in order. */
function words(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N},]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** A card's given name: N's given name, else the first word of its name ("Doe, Jane" gives "jane"). */
function givenName(card) {
  if (card.nameParts.given) {
    return words(card.nameParts.given)[0] ?? "";
  }
  const name = label(card);
  const comma = name.indexOf(",");
  return (comma > 0 ? words(name.slice(comma + 1)) : words(name))[0]?.replace(/,/g, "") ?? "";
}

/**
 * Whether two cards' names could be one person: the same name, or given
 * names where one starts the other ("Sam" and "Sammy", "J" and "Jane"). A
 * card with no real name (only an address or number) fits any name. "Sam
 * Roe" and "Pat Roe" don't: a shared family name is how households look.
 */
export function namesCompatible(a, b) {
  const nameA = label(a);
  const nameB = label(b);
  if (!isRealName(nameA) || !isRealName(nameB) || nameKey(nameA) === nameKey(nameB)) {
    return true;
  }
  const ga = givenName(a);
  const gb = givenName(b);
  return Boolean(ga && gb && (ga.startsWith(gb) || gb.startsWith(ga)));
}

const KIND = { e: "email", p: "phone", x: "chat", n: "name" };

/**
 * Who links to whom in a group, and through what:
 * [{ a, b, shared: [{ kind: "email"|"phone"|"chat"|"name", value }] }],
 * one entry per pair of cards that share something.
 */
export function groupLinks(cards) {
  const keys = cards.map(keysOf);
  const links = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const shared = [];
      for (const [key, value] of keys[i]) {
        if (keys[j].has(key)) {
          shared.push({ kind: KIND[key[0]], value });
        }
      }
      if (shared.length) {
        links.push({ a: cards[i], b: cards[j], shared });
      }
    }
  }
  return links;
}

/**
 * Whether a link is good evidence of one person: the same full name (two
 * words or more), or a shared email address, chat address or phone number
 * with names that fit (namesCompatible). A shared number with different
 * given names (a household), or a one-word name alone ("Mom"), isn't.
 */
export function strongLink(link) {
  const kinds = new Set(link.shared.map((s) => s.kind));
  if (kinds.has("name") && words(label(link.a)).length >= 2) {
    return true;
  }
  return (kinds.has("email") || kinds.has("chat") || kinds.has("phone")) && namesCompatible(link.a, link.b);
}

/**
 * A first guess at who is who in a group: card id -> person number (1, 2,
 * ...), cards joined by strong links being one person. People are numbered
 * biggest first. `dismissed` pairs are never joined directly.
 */
export function suggestPeople(cards, dismissed = new Set()) {
  const index = new Map(cards.map((c, i) => [c.id, i]));
  const parent = cards.map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const link of groupLinks(cards)) {
    if (strongLink(link) && !dismissed.has(pairKey(link.a.id, link.b.id))) {
      parent[find(index.get(link.a.id))] = find(index.get(link.b.id));
    }
  }
  const people = new Map();
  cards.forEach((card, i) => {
    const root = find(i);
    people.set(root, [...(people.get(root) ?? []), card]);
  });
  const sorted = [...people.values()].sort((x, y) => y.length - x.length || label(x[0]).localeCompare(label(y[0])));
  const assign = {};
  sorted.forEach((members, n) => {
    for (const card of members) {
      assign[card.id] = n + 1;
    }
  });
  return assign;
}

/** The pairs of cards put in different people (pairKey()s), to keep them from grouping again. */
export function apartPairs(assign) {
  const ids = Object.keys(assign);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (assign[ids[i]] !== assign[ids[j]]) {
        pairs.push(pairKey(ids[i], ids[j]));
      }
    }
  }
  return pairs;
}

/** Fields with several values; each value is picked on its own. */
export const MULTI = [
  { name: "TEL", label: "Phone numbers", key: (p) => phoneKey(unescapeText(p.value)) ?? unescapeText(p.value).trim() },
  { name: "EMAIL", label: "Email addresses", key: (p) => unescapeText(p.value).trim().toLowerCase() },
  { name: "IMPP", label: "Chat addresses", key: (p) => unescapeText(p.value).trim().toLowerCase() },
  { name: "ADR", label: "Addresses", key: (p) => splitStructured(p.value).map((s) => s.trim().toLowerCase()).filter(Boolean).join(", ") },
  { name: "URL", label: "Websites", key: (p) => unescapeText(p.value).trim().toLowerCase().replace(/\/$/, "") },
];

/** Fields with one value; one card's is picked. */
export const SINGLE = [
  { name: "ORG", label: "Organization" },
  { name: "TITLE", label: "Job title" },
  { name: "NICKNAME", label: "Nickname" },
  { name: "BDAY", label: "Birthday" },
  { name: "ANNIVERSARY", label: "Anniversary" },
];

// Never copied from the other cards: the card's identity and fields merged
// on their own terms above and below.
const NOT_COPIED = new Set([
  "BEGIN", "END", "VERSION", "UID", "REV", "PRODID", "PHOTO", "FN", "N", "NOTE", "CATEGORIES",
  "X-ABLABEL", "X-ABUID", "X-ABSHOWAS", "",
  ...MULTI.map((m) => m.name), ...SINGLE.map((s) => s.name),
]);

const display = (prop) => (prop.name === "ADR"
  ? splitStructured(prop.value).map((s) => s.trim()).filter(Boolean).join(", ")
  : unescapeText(prop.value));

/**
 * What a group's merge offers, for the merge screen:
 *   keeper     the card kept by default (one with a photo, else the one with the most fields)
 *   names      the distinct names
 *   multi      [{ name, label, values: [{ key, text, from }] }], every distinct value
 *   single     [{ name, label, values: [{ text, from }] }] where the cards hold a value
 *   notes      [{ from, text }]
 *   categories the union of the cards' categories
 */
export function mergeOptions(cards) {
  const size = (c) => c.vcard.props.length;
  const keeper = cards.find((c) => c.hasPhoto) ?? [...cards].sort((a, b) => size(b) - size(a))[0];
  const names = [...new Set(cards.map((c) => c.name || nameFromParts(c.nameParts)).filter(Boolean))];

  const multi = MULTI.map((field) => {
    const seen = new Set();
    const values = [];
    // The kept card's own values first, so a value it shares keeps its line.
    for (const card of [keeper, ...cards.filter((c) => c !== keeper)]) {
      for (const prop of getAll(card.vcard, field.name)) {
        const key = field.key(prop);
        if (key && !seen.has(key)) {
          seen.add(key);
          values.push({ key, text: display(prop), from: card.id });
        }
      }
    }
    return { name: field.name, label: field.label, values };
  }).filter((f) => f.values.length);

  const single = SINGLE.map((field) => {
    const seen = new Set();
    const values = [];
    for (const card of cards) {
      const prop = first(card.vcard, field.name);
      const text = prop ? display(prop).trim() : "";
      if (text && !seen.has(text)) {
        seen.add(text);
        values.push({ text, from: card.id });
      }
    }
    return { name: field.name, label: field.label, values };
  }).filter((f) => f.values.length);

  const notes = cards
    .map((c) => ({ from: c.id, text: unescapeText(first(c.vcard, "NOTE")?.value ?? "").trim() }))
    .filter((n) => n.text);

  return { keeper: keeper.id, names, multi, single, notes, categories: categoriesOf([keeper, ...cards]) };
}

function categoriesOf(cards) {
  const seen = new Map();
  for (const card of cards) {
    for (const prop of getAll(card.vcard, "CATEGORIES")) {
      for (const category of prop.value.split(/(?<!\\),/).map(unescapeText).map((s) => s.trim()).filter(Boolean)) {
        if (!seen.has(category.toLowerCase())) {
          seen.set(category.toLowerCase(), category);
        }
      }
    }
  }
  return [...seen.values()];
}

/**
 * The kept card's new vCard text after a merge.
 *
 * @param {object[]} cards - the group (read cards)
 * @param {string} keeperId - the card that stays
 * @param {object} choice
 * @param {string} choice.name - the display name
 * @param {Object<string, Set<string>|string[]>} choice.multi - field name -> the value keys kept
 * @param {Object<string, string|null>} choice.single - field name -> the value kept ("" or null: none)
 * @param {string} choice.note - the note
 */
export function mergeVCard(cards, keeperId, choice) {
  const keeper = cards.find((c) => c.id === keeperId);
  const others = cards.filter((c) => c !== keeper);
  const vcard = parseVCard(keeper.vCard);

  // Name.
  const fn = first(vcard, "FN");
  if (fn) {
    setValue(fn, escapeText(choice.name));
  } else if (choice.name) {
    insertProp(vcard, makeProp("FN", escapeText(choice.name)), "VERSION");
  }
  if (!first(vcard, "N")) {
    const n = others.map((c) => first(c.vcard, "N")).find(Boolean);
    if (n) {
      insertProp(vcard, withoutGroupAndParams(n), "FN");
    }
  }

  // Fields with several values: drop what wasn't kept, add the others' kept values.
  for (const field of MULTI) {
    const kept = new Set(choice.multi?.[field.name] ?? []);
    const have = new Set();
    for (const prop of getAll(vcard, field.name)) {
      const key = field.key(prop);
      if (!kept.has(key) || have.has(key)) {
        removeProp(vcard, prop);
      } else {
        have.add(key);
      }
    }
    for (const card of others) {
      for (const prop of getAll(card.vcard, field.name)) {
        const key = field.key(prop);
        if (kept.has(key) && !have.has(key)) {
          have.add(key);
          // PREF stays with the kept card's own values.
          insertProp(vcard, withoutGroupAndParams(prop, ["PREF"]), "FN");
        }
      }
    }
  }

  // Fields with one value.
  for (const field of SINGLE) {
    const wanted = (choice.single?.[field.name] ?? "").trim();
    const current = first(vcard, field.name);
    if (current && display(current).trim() === wanted) {
      continue;
    }
    for (const prop of getAll(vcard, field.name)) {
      removeProp(vcard, prop);
    }
    if (wanted) {
      const source = cards.map((c) => first(c.vcard, field.name)).find((p) => p && display(p).trim() === wanted);
      insertProp(vcard, source ? withoutGroupAndParams(source) : makeProp(field.name, escapeText(wanted)));
    }
  }

  // Note.
  const note = String(choice.note ?? "").trim();
  const noteProps = getAll(vcard, "NOTE");
  if (note) {
    if (noteProps.length) {
      setValue(noteProps[0], escapeText(note));
      noteProps.slice(1).forEach((p) => removeProp(vcard, p));
    } else {
      insertProp(vcard, makeProp("NOTE", escapeText(note)));
    }
  } else {
    noteProps.forEach((p) => removeProp(vcard, p));
  }

  // Categories: all of them.
  const categories = categoriesOf([keeper, ...others]);
  const categoryProps = getAll(vcard, "CATEGORIES");
  if (categories.length && categoriesOf([keeper]).length !== categories.length) {
    categoryProps.forEach((p) => removeProp(vcard, p));
    insertProp(vcard, makeProp("CATEGORIES", categories.map(escapeText).join(",")));
  }

  // Anything else the other cards hold and the kept one doesn't.
  for (const card of others) {
    for (const prop of card.vcard.props) {
      if (NOT_COPIED.has(prop.name) || prop.name.startsWith("X-MOZILLA")) {
        continue;
      }
      const copy = parseLine(prop.group ? prop.raw.slice(prop.group.length + 1) : prop.raw);
      if (!vcard.props.some((p) => p.name === copy.name && p.value === copy.value)) {
        insertProp(vcard, copy);
      }
    }
  }

  return serializeVCard(vcard);
}
