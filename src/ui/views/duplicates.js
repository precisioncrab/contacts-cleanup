/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Duplicates: groups of cards that look like the same person, and the
 * merge page (pick the card to keep and what it keeps), like Daynizer's
 * Review duplicates screen.
 */

import { h, plural } from "../dom.js";
import { toolbar, row, avatar, cardSummary, emptyState, help, matches, tag } from "../parts.js";
import { label } from "../../core/card.js";
import { mergeOptions, mergeVCard, pairKey } from "../../core/duplicates.js";

const groupKey = (group) => group.cards.map((c) => c.id).sort().join("|");

function visibleGroups(ctx) {
  return ctx.derived.duplicates.filter((g) => g.cards.some((c) => matches(c, ctx.state.search)));
}

function dismiss(ctx, group) {
  const pairs = [];
  for (let a = 0; a < group.cards.length; a++) {
    for (let b = a + 1; b < group.cards.length; b++) {
      pairs.push(pairKey(group.cards[a].id, group.cards[b].id));
    }
  }
  ctx.dismiss(pairs);
}

/** Opens the merge page for a group, with everything kept. */
function openMerge(ctx, group) {
  const options = mergeOptions(group.cards);
  ctx.state.merge = { key: groupKey(group), options, ...defaultsFor(group.cards, options, options.keeper) };
  ctx.render();
}

/** Name, single fields and note as the kept card has them (the first value otherwise). */
function defaultsFor(cards, options, keeperId) {
  const keeper = cards.find((c) => c.id === keeperId);
  const single = {};
  for (const field of options.single) {
    single[field.name] = (field.values.find((v) => v.from === keeperId) ?? field.values[0]).text;
  }
  const multi = {};
  for (const field of options.multi) {
    multi[field.name] = new Set(field.values.map((v) => v.key));
  }
  return {
    keeperId,
    // The fullest name ("Jane Doe" over "Jane D"), whichever card has it.
    name: [...options.names].sort((a, b) => b.length - a.length)[0] || label(keeper),
    single,
    multi: Object.keys(multi).length ? multi : {},
    note: (options.notes.find((n) => n.from === keeperId) ?? options.notes[0])?.text ?? "",
  };
}

function mergePage(ctx, group) {
  const m = ctx.state.merge;
  const cards = group.cards;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const from = (id) => `from ${label(byId.get(id))}${new Set(cards.map((c) => c.bookName)).size > 1 ? `, ${byId.get(id).bookName}` : ""}`;
  const others = cards.filter((c) => c.id !== m.keeperId);
  const books = [...new Set(others.map((c) => c.bookName))];

  const doMerge = async () => {
    const keeper = byId.get(m.keeperId);
    const vCard = mergeVCard(cards, m.keeperId, { name: m.name.trim() || label(keeper), multi: m.multi, single: m.single, note: m.note });
    const name = m.name.trim() || label(keeper);
    const entry = await ctx.apply(`Merged ${plural(cards.length, "card", "cards")} into ${name}`, [
      { type: "update", id: keeper.id, vCard, label: name },
      ...others.map((c) => ({ type: "delete", id: c.id, label: label(c) })),
    ]);
    if (entry) {
      ctx.state.merge = null;
      ctx.state.selected = null;
      ctx.render();
    }
  };

  const section = (title, ...body) => h("div", { class: "page-section" }, h("div", { class: "label" }, title), body);

  return [
    h("div", { class: "toolbar" },
      h("button", { onClick: () => {
        ctx.state.merge = null;
        ctx.render();
      } }, "‹ Back"),
      h("h2", { style: { flex: "1" } }, `Merge ${plural(cards.length, "card", "cards")}`),
      h("button", { class: "primary", disabled: Boolean(ctx.state.busy), onClick: doMerge }, ctx.state.busy ? "Merging…" : "Merge into one")),
    h("div", { class: "page", "data-scroll": "merge" },
      section("Keep this card",
        cards.map((card) => h("label", { class: "choice" },
          h("input", {
            type: "radio",
            name: "keeper",
            checked: m.keeperId === card.id,
            onChange: () => {
              Object.assign(m, defaultsFor(cards, m.options, card.id), { multi: m.multi });
              ctx.render();
            },
          }),
          avatar(card),
          h("strong", {}, label(card)),
          h("span", { class: "from" }, card.bookName),
          card.hasPhoto && tag("photo", "plain"))),
        h("p", { style: { fontSize: "12px", margin: "6px 0 0" } },
          `The ${others.length === 1 ? "other card is" : "other cards are"} deleted from ${books.join(" and ")} after merging. An address book that syncs with a server (CardDAV) deletes ${others.length === 1 ? "it" : "them"} there too. Undo brings ${others.length === 1 ? "it" : "them"} back.`)),

      section("Name",
        h("input", { type: "text", id: "merge-name", value: m.name, list: "merge-names", onInput: (e) => {
          m.name = e.target.value;
        } }),
        h("datalist", { id: "merge-names" }, m.options.names.map((n) => h("option", { value: n })))),

      m.options.multi.map((field) => section(field.label,
        field.values.map((v) => h("label", { class: "choice" },
          h("input", {
            type: "checkbox",
            checked: m.multi[field.name]?.has(v.key),
            onChange: (e) => {
              m.multi[field.name][e.target.checked ? "add" : "delete"](v.key);
            },
          }),
          h("span", {}, v.text),
          h("span", { class: "from" }, from(v.from)))))),

      m.options.single.map((field) => section(field.label,
        h("select", { onChange: (e) => {
          m.single[field.name] = e.target.value;
        } },
        h("option", { value: "", selected: !m.single[field.name] }, "(none)"),
        field.values.map((v) => h("option", { value: v.text, selected: m.single[field.name] === v.text }, `${v.text}  (${from(v.from)})`))))),

      section("Note",
        h("textarea", { id: "merge-note", value: m.note, onInput: (e) => {
          m.note = e.target.value;
        } }),
        m.options.notes.filter((n) => n.from !== m.keeperId && !m.note.includes(n.text)).map((n) => h("div", {},
          h("button", { class: "link", style: { marginTop: "6px" }, onClick: () => {
            m.note = m.note ? `${m.note}\n\n${n.text}` : n.text;
            ctx.render();
          } }, `+ Add the note ${from(n.from)}`)))),

      m.options.categories.length
        ? section("Categories", h("p", { style: { margin: 0, fontSize: "12px" } }, `All kept: ${m.options.categories.join(", ")}`))
        : null,

      h("div", { class: "notice" }, "Everything else on the cards (photos, other fields) stays on the card you keep, and fields only the other cards have are added to it.")),
  ];
}

export default {
  id: "duplicates",
  title: "Duplicates",
  dot: "#e8a23d",

  count: (ctx) => ctx.derived.duplicates.length,

  main(ctx) {
    const merging = ctx.state.merge && ctx.derived.duplicates.find((g) => groupKey(g) === ctx.state.merge.key);
    if (merging) {
      return mergePage(ctx, merging);
    }
    const groups = visibleGroups(ctx);
    return [
      toolbar(ctx, { title: "Duplicates" }),
      h("div", { class: "list", "data-scroll": "list" },
        groups.length === 0
          ? emptyState(ctx.state.search ? "Nothing matches the search." : "No duplicates found.", ctx.state.search ? "" : "Cards with the same email address, phone number, chat address or name show here.")
          : groups.map((group) => row(ctx, {
            key: groupKey(group),
            lead: h("div", { class: "avatars" }, group.cards.slice(0, 3).map((c) => avatar(c))),
            title: [...new Set(group.cards.map(label))].join(", "),
            meta: [
              h("span", {}, plural(group.cards.length, "card", "cards")),
              h("span", {}, group.reasons.join(", ")),
              new Set(group.cards.map((c) => c.bookName)).size > 1 ? h("span", {}, [...new Set(group.cards.map((c) => c.bookName))].join(" and ")) : null,
            ],
            actions: [
              h("button", { class: "primary", disabled: Boolean(ctx.state.busy), onClick: () => openMerge(ctx, group) }, "Review and merge"),
              h("button", { onClick: () => dismiss(ctx, group) }, "Not duplicates"),
            ],
          }))),
    ];
  },

  detail(ctx) {
    if (ctx.state.merge) {
      return [
        h("h3", {}, "Merging"),
        h("p", {}, "Pick the card to keep, then what it keeps. Every value starts checked, so nothing is lost unless you uncheck it."),
        h("p", {}, "Nothing changes until you click Merge into one. Edit > Undo (or Changes) puts every card back as it was."),
      ];
    }
    const group = ctx.derived.duplicates.find((g) => groupKey(g) === ctx.state.selected);
    if (!group) {
      return [
        h("h3", {}, "Duplicates"),
        h("p", {}, "Cards that look like the same person: the same email address, phone number (in any format) or chat address, or the same name. Groups can span address books."),
        h("p", {}, "Review and merge keeps one card and adds what you pick from the others. Not duplicates hides a group for good."),
        h("div", { class: "no-selection" }, "Select a group to see its cards."),
      ];
    }
    return [
      h("h3", {}, `${plural(group.cards.length, "card", "cards")}: ${group.reasons.join(", ")}`),
      group.cards.map((card) => h("div", { style: { marginBottom: "12px" } }, cardSummary(card))),
      h("div", { class: "detail-actions" },
        h("button", { class: "primary", disabled: Boolean(ctx.state.busy), onClick: () => openMerge(ctx, group) }, "Review and merge"),
        h("button", { onClick: () => dismiss(ctx, group) }, "Not duplicates")),
    ];
  },
};
