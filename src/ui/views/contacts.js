/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Contacts: every contact in the checked address books, like Daynizer's
 * Contacts tab: search, New contact, Import vCard, and the selected
 * contact's editor in the right-hand panel (src/ui/contact-panel.js). A
 * label in the sidebar (under Contacts) shows only the contacts with it.
 */

import { h, plural } from "../dom.js";
import { toolbar, row, avatar, emptyState, matches, tag, virtualList } from "../parts.js";
import { contactPanel, startNewContact } from "../contact-panel.js";
import { label } from "../../core/card.js";
import { partnersOf } from "../../core/copies.js";

/** Every label in use, with how many contacts have it: [[label, count]], by name. */
export function allLabels(cards) {
  const counts = new Map();
  for (const card of cards) {
    for (const l of card.labels) {
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
}

/** The mailing lists picked in the sidebar. */
const pickedLists = (ctx) => ctx.state.books.flatMap((b) => b.lists ?? []).filter((l) => ctx.state.pick.lists.includes(l.id));

/** Whether a card is on a mailing list (a list holds cards of its own address book, by UID). */
export const onList = (list, card) => card.parentId === list.parentId && list.members.includes(card.uid);

/** The contacts the sidebar selection shows: in any selected address book, with any selected label or on any selected mailing list (all when nothing is selected). */
function visible(ctx) {
  const { books, labels } = ctx.state.pick;
  const lists = pickedLists(ctx);
  const base = books.length + labels.length + lists.length
    ? ctx.state.shownCards.filter((c) => books.includes(c.parentId) || labels.some((l) => c.labels.includes(l)) || lists.some((l) => onList(l, c)))
    : ctx.state.cards;
  return base.filter((c) => matches(c, ctx.state.search));
}

/** The page title's selection: "Contacts: Work, Family + 2". */
function pickTitle(ctx) {
  const { books, labels } = ctx.state.pick;
  const names = [...books.map((id) => ctx.state.books.find((b) => b.id === id)?.name ?? "?"), ...labels, ...pickedLists(ctx).map((l) => l.name)];
  if (!names.length) {
    return "Contacts";
  }
  return `Contacts: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` + ${names.length - 2}` : ""}`;
}

/** Splits a .vcf file into its vCards. */
export const splitVCards = (text) => String(text).match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];

function importVCards(ctx) {
  const input = h("input", { type: "file", accept: ".vcf,.vcard,text/vcard", hidden: true });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) {
      return;
    }
    const cards = splitVCards(await file.text());
    if (!cards.length) {
      ctx.toast(`${file.name} has no contacts in it.`, { error: true });
      return;
    }
    const excluded = ctx.excludedBooks();
    const books = ctx.state.books.filter((b) => !b.readOnly && !b.remote && !excluded.has(b.id));
    let book = books.some((b) => b.id === ctx.state.settings.newCardBook) ? ctx.state.settings.newCardBook : books[0]?.id;
    const go = await ctx.confirm({
      title: `Import ${plural(cards.length, "contact", "contacts")}?`,
      body: [
        h("p", {}, `From ${file.name}, into:`),
        h("select", { style: { width: "100%" }, onChange: (e) => {
          book = e.target.value;
        } }, books.map((b) => h("option", { value: b.id, selected: b.id === book }, b.name))),
        h("p", { class: "hint", style: { marginTop: "10px" } }, "Undo (the message after, or Changes) takes them out again."),
      ],
      ok: `Import ${cards.length}`,
    });
    if (!go || !book) {
      return;
    }
    // The cards' own UIDs are left out, so contacts already here aren't refused as taken.
    await ctx.apply(`Imported ${plural(cards.length, "contact", "contacts")} from ${file.name}`, cards.map((text) => {
      const vCard = `${text.replace(/\r?\nUID:[^\r\n]*/i, "").trim()}\r\n`;
      const name = /\nFN[^:\n]*:([^\r\n]*)/i.exec(vCard)?.[1]?.trim() || "Contact";
      return { type: "create", parentId: book, vCard, label: name };
    }));
  });
  document.body.append(input);
  input.click();
}

export default {
  id: "contacts",
  title: "All contacts",
  dot: "#8a8d93",

  count: (ctx) => ctx.state.cards.length,

  main(ctx) {
    // The cards come sorted by name (tab.js reload).
    const list = visible(ctx);
    const manyBooks = new Set(ctx.state.cards.map((c) => c.bookName)).size > 1;
    return [
      toolbar(ctx, {
        title: pickTitle(ctx),
        extra: [h("button", { onClick: () => importVCards(ctx) }, "Import vCard…")],
        primary: { label: "+ New contact", onClick: () => startNewContact(ctx) },
      }),
      virtualList("contacts", list, (card) => row(ctx, {
        key: card.id,
        lead: avatar(card),
        title: label(card),
        meta: [
          h("span", {}, card.org || card.emails[0]?.address || card.phones[0]?.value || ""),
          manyBooks ? h("span", {}, card.bookName) : null,
          card.shadowed ? tag(`also in ${card.shadowed}: can't change this copy`, "warn") : null,
          partnersOf(ctx.state.links, card.id).length ? tag("linked", "plain") : null,
        ],
      }), { empty: ctx.state.search
        ? emptyState("Nothing matches the search.", "")
        : pickedLists(ctx).length && ctx.state.pick.books.length + ctx.state.pick.labels.length === 0
          ? emptyState("No one on this mailing list yet.", "Select a contact in its address book and tick the list under Mailing lists in the editor. Thunderbird only puts contacts with an email address on a mailing list.")
          : emptyState("No contacts here yet.", "Pick an address book in the sidebar, or add a contact.") }),
    ];
  },

  detail(ctx) {
    if (ctx.state.newContact) {
      return contactPanel(ctx, null);
    }
    const card = ctx.state.cards.find((c) => c.id === ctx.state.selected);
    if (!card) {
      return [
        h("h3", {}, "Contacts"),
        h("p", {}, "Select a contact to see and change everything on it, or + New contact to add one."),
        h("p", {}, "The address books checked in the sidebar are the ones shown here and on every other page."),
        h("div", { class: "no-selection" }, "Select a contact to see details."),
      ];
    }
    return contactPanel(ctx, card);
  },
};
