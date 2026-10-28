/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Contacts: every contact in the checked address books, like Daynizer's
 * Contacts tab: search, New contact, Import vCard, and the selected
 * contact's editor in the right-hand panel (src/ui/contact-panel.js). A
 * label in the sidebar (under Contacts) shows only the contacts with it.
 * Right-click on a contact: its labels and mailing lists (src/ui/tab.js).
 *
 * One mailing list picked on its own opens its page: everyone in its
 * address book with a checkbox, members ticked. Ticks wait for Apply,
 * which puts the ticked ones on the list and takes the unticked ones off,
 * as one change.
 */

import { h, plural } from "../dom.js";
import { toolbar, row, avatar, emptyState, matches, tag, virtualList, pendingBar, selectAll } from "../parts.js";
import { contactPanel, startNewContact } from "../contact-panel.js";
import { label } from "../../core/card.js";
import { partnersOf, addLabels } from "../../core/copies.js";

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

const NEW_BOOK = "new";

/**
 * Import vCard: the file's contacts into any address book add-ons can
 * write to (hidden ones too), or into a new one named after the file, with
 * a label on each if one is given. One change: Undo takes them out again,
 * and deletes the new address book when nothing else went into it.
 */
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
    const hidden = new Set(ctx.state.settings.hiddenBooks ?? []);
    const books = ctx.state.books.filter((b) => !b.readOnly && !b.remote);
    const picked = ctx.state.pick.books.find((id) => books.some((b) => b.id === id));
    let book = picked ?? (books.some((b) => b.id === ctx.state.settings.newCardBook) ? ctx.state.settings.newCardBook : books[0]?.id ?? NEW_BOOK);
    let bookName = file.name.replace(/\.(vcf|vcard)$/i, "").trim() || "Imported";
    let labelText = "";
    const nameBox = h("div", { hidden: book !== NEW_BOOK },
      h("label", { class: "dialog-label" }, "Name of the new address book"),
      h("input", { type: "text", style: { width: "100%" }, value: bookName, onInput: (e) => {
        bookName = e.target.value;
      } }),
      h("p", { class: "hint" }, "A local address book, like Personal Address Book, so it can hold mailing lists. A synced one (CardDAV, Google) is set up in Thunderbird."));
    const known = [...new Set(ctx.state.allCards.flatMap((c) => c.labels))].sort((a, b) => a.localeCompare(b));
    const go = await ctx.confirm({
      title: `Import ${plural(cards.length, "contact", "contacts")}?`,
      body: [
        h("p", {}, `From ${file.name}, into:`),
        h("select", { style: { width: "100%" }, onChange: (e) => {
          book = e.target.value;
          nameBox.hidden = book !== NEW_BOOK;
        } },
        books.map((b) => h("option", { value: b.id, selected: b.id === book }, hidden.has(b.id) ? `${b.name} (hidden in the sidebar)` : b.name)),
        h("option", { value: NEW_BOOK, selected: book === NEW_BOOK }, "New address book…")),
        nameBox,
        h("label", { class: "dialog-label" }, "Add a label to each contact (optional)"),
        h("input", { type: "text", style: { width: "100%" }, list: "import-labels", placeholder: "Pick one or type a new one", onInput: (e) => {
          labelText = e.target.value;
        } }),
        h("datalist", { id: "import-labels" }, known.map((l) => h("option", { value: l }))),
        h("p", { class: "hint", style: { marginTop: "10px" } }, "Undo (the message after, or Changes) takes them out again, and deletes a new address book with them."),
      ],
      ok: `Import ${cards.length}`,
    });
    const newName = bookName.trim();
    if (!go || !book || (book === NEW_BOOK && !newName)) {
      return;
    }
    const into = book === NEW_BOOK ? { bookRef: NEW_BOOK } : { parentId: book };
    const extra = labelText.trim();
    const where = book === NEW_BOOK ? `the new address book ${newName}` : books.find((b) => b.id === book)?.name;
    // The cards' own UIDs are left out, so contacts already here aren't refused as taken.
    const entry = await ctx.apply(`Imported ${plural(cards.length, "contact", "contacts")} from ${file.name} into ${where}${extra ? `, labeled ${extra}` : ""}`, [
      ...(book === NEW_BOOK ? [{ type: "createBook", name: newName, ref: NEW_BOOK, label: newName }] : []),
      ...cards.map((text) => {
        let vCard = `${text.replace(/\r?\nUID:[^\r\n]*/i, "").trim()}\r\n`;
        if (extra) {
          vCard = addLabels(vCard, [extra]);
        }
        const name = /\nFN[^:\n]*:([^\r\n]*)/i.exec(vCard)?.[1]?.trim() || "Contact";
        return { type: "create", ...into, vCard, label: name };
      }),
    ]);
    // A new address book shows with what came in.
    const made = entry?.madeBooks?.[0]?.id;
    if (made) {
      ctx.show("books", made);
    }
  });
  document.body.append(input);
  input.click();
}

/** Whether a card can go on a mailing list: Thunderbird needs an email address, and must reach this copy. */
const canJoin = (card) => card.emails.length > 0 && !card.shadowed;

/** The ticks on a list's page ({ listId, ticks: Map(card id -> on), show }), started again for another list. */
function listEdit(ctx, list) {
  let edit = ctx.state.listEdit;
  if (!edit || edit.listId !== list.id) {
    edit = { listId: list.id, ticks: new Map(), show: "all" };
    ctx.state.listEdit = edit;
  }
  // A tick that matches the list now (applied, or changed elsewhere) is no change any more.
  for (const [id, on] of edit.ticks) {
    const card = ctx.state.allCards.find((c) => c.id === id);
    if (!card || onList(list, card) === on) {
      edit.ticks.delete(id);
    }
  }
  return edit;
}

/** The list's page: everyone in its address book, members ticked; Apply puts on and takes off. */
function listPage(ctx, list) {
  const book = ctx.state.books.find((b) => b.id === list.parentId);
  const edit = listEdit(ctx, list);
  const people = ctx.state.allCards.filter((c) => c.parentId === list.parentId);
  const members = people.filter((c) => onList(list, c)).length;
  const ticked = (card) => (edit.ticks.has(card.id) ? edit.ticks.get(card.id) : onList(list, card));
  const shown = people
    .filter((c) => edit.show === "all" || (edit.show === "on") === onList(list, c))
    .filter((c) => matches(c, ctx.state.search));
  const tick = (card, on) => {
    if (on === onList(list, card)) {
      edit.ticks.delete(card.id);
    } else {
      edit.ticks.set(card.id, on);
    }
  };
  // "All shown": the ones that can be ticked (or are on the list already, and can come off).
  const tickable = shown.filter((c) => canJoin(c) || (onList(list, c) && !c.shadowed));
  const adding = [...edit.ticks.values()].filter(Boolean).length;
  const removing = edit.ticks.size - adding;
  const apply = async () => {
    const changes = [...edit.ticks].map(([id, on]) => {
      const card = ctx.state.allCards.find((c) => c.id === id);
      return { type: "listMember", listId: list.id, id, add: on, label: card ? label(card) : "Contact" };
    });
    const one = changes.length === 1 ? changes[0] : null;
    const title = one
      ? (one.add ? `Put ${one.label} on the mailing list ${list.name}` : `Took ${one.label} off the mailing list ${list.name}`)
      : `Mailing list ${list.name}: ${[adding ? `put ${adding} on` : null, removing ? `took ${removing} off` : null].filter(Boolean).join(", ")}`;
    if (await ctx.apply(title, changes)) {
      edit.ticks.clear();
      ctx.render();
    }
  };
  const what = [adding ? `put ${plural(adding, "contact", "contacts")} on` : null, removing ? `take ${plural(removing, "contact", "contacts")} off` : null].filter(Boolean).join(" and ");
  return [
    toolbar(ctx, {
      title: `☰ ${list.name}`,
      extra: [h("select", { "aria-label": "Show", onChange: (e) => {
        edit.show = e.target.value;
        ctx.render();
      } }, [["all", "Everyone"], ["on", "On the list"], ["off", "Not on it"]].map(([value, text]) => h("option", { value, selected: edit.show === value }, text)))],
    }),
    h("div", { class: "toolbar-filters list-filters" },
      selectAll("All shown", tickable.map(ticked), (on) => {
        for (const card of tickable) {
          if (!on || canJoin(card)) {
            tick(card, on);
          }
        }
        ctx.render();
      }),
      h("span", { class: "hint" }, `In ${book?.name ?? "its address book"}: ${plural(members, "member", "members")} of ${plural(people.length, "contact", "contacts")}. Tick to put on, untick to take off, then Apply.`)),
    virtualList(`list-${list.id}`, shown, (card) => {
      const on = onList(list, card);
      const why = card.shadowed ? `Also in ${card.shadowed}: Thunderbird doesn't let add-ons change this copy.` : !card.emails.length ? "No email address: Thunderbird only puts contacts with one on a mailing list." : null;
      return row(ctx, {
        key: card.id,
        check: {
          checked: ticked(card),
          // Someone on the list can always come off; joining needs an email address.
          disabled: card.shadowed || (!on && !canJoin(card)),
          title: why ?? (on ? "On the list" : "Put on the list"),
          onChange: (value) => {
            tick(card, value);
            ctx.render();
          },
        },
        lead: avatar(card),
        title: label(card),
        muted: !on && !canJoin(card),
        meta: [
          h("span", {}, card.emails[0]?.address || "no email address"),
          edit.ticks.has(card.id) ? tag(edit.ticks.get(card.id) ? "goes on" : "comes off", "plain") : null,
        ],
        onContextMenu: (e) => ctx.contactMenu(e, card),
      });
    }, { empty: ctx.state.search
      ? emptyState("Nothing matches the search.", `Searched everyone in ${book?.name ?? "the address book"}.`)
      : people.length
        ? emptyState(edit.show === "on" ? "No one on this mailing list yet." : "Everyone is on it.", "")
        : emptyState(`${book?.name ?? "This address book"} has no contacts yet.`, "A mailing list holds contacts of its own address book.") }),
    edit.ticks.size ? pendingBar(ctx, { text: `Apply to ${what}.`, applyLabel: "Apply", onApply: apply, onClear: () => {
      edit.ticks.clear();
      ctx.render();
    } }) : null,
  ];
}

export default {
  id: "contacts",
  title: "All contacts",
  dot: "#8a8d93",

  count: (ctx) => ctx.state.cards.length,

  main(ctx) {
    const lists = pickedLists(ctx);
    if (lists.length === 1 && ctx.state.pick.books.length + ctx.state.pick.labels.length === 0) {
      return listPage(ctx, lists[0]);
    }
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
        onContextMenu: (e) => ctx.contactMenu(e, card),
      }), { empty: ctx.state.search
        ? emptyState("Nothing matches the search.", "")
        : lists.length && ctx.state.pick.books.length + ctx.state.pick.labels.length === 0
          ? emptyState("No one on these mailing lists yet.", "Click one list on its own to put contacts on it.")
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
