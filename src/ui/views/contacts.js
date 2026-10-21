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
import { toolbar, row, avatar, emptyState, matches } from "../parts.js";
import { contactPanel, startNewContact } from "../contact-panel.js";
import { label } from "../../core/card.js";

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

function visible(ctx) {
  const filter = ctx.state.contactsFilter;
  return ctx.state.cards.filter((c) => matches(c, ctx.state.search) && (!filter || c.labels.includes(filter)));
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
    const excluded = new Set(ctx.state.settings.excludedBooks);
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
    const list = visible(ctx).sort((a, b) => label(a).localeCompare(label(b)));
    const filter = ctx.state.contactsFilter;
    return [
      toolbar(ctx, {
        title: filter ? `Contacts: ${filter}` : "Contacts",
        extra: [h("button", { onClick: () => importVCards(ctx) }, "Import vCard…")],
        primary: { label: "+ New contact", onClick: () => startNewContact(ctx) },
      }),
      h("div", { class: "list", "data-scroll": "list" },
        list.length === 0
          ? emptyState(ctx.state.search ? "Nothing matches the search." : "No contacts here yet.", ctx.state.search ? "" : "Check an address book in the sidebar, or add a contact.")
          : list.map((card) => row(ctx, {
            key: card.id,
            lead: avatar(card),
            title: label(card),
            meta: [
              h("span", {}, card.org || card.emails[0]?.address || card.phones[0]?.value || ""),
              new Set(ctx.state.cards.map((c) => c.bookName)).size > 1 ? h("span", {}, card.bookName) : null,
            ],
          }))),
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
