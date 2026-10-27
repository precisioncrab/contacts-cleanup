/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * In several books: contacts that are in more than one address book with
 * the same contact ID (src/core/copies.js). Thunderbird lets add-ons
 * change only one of those copies, so each can be sorted out:
 *   Leave as is, Link the copies, Keep one copy (the others' address
 *   books, and mailing lists, become labels on it), or Separate them.
 * For one contact (select it, right-hand panel), or for every contact in
 * the same address books at once (the box above the list). "Leave as is"
 * starts selected, so nothing happens until another choice is made.
 */

import { h, plural } from "../dom.js";
import { toolbar, row, avatar, cardSummary, emptyState, matches, tag, virtualList } from "../parts.js";
import { label } from "../../core/card.js";
import { findCopies, booksKey, differences, copiesPlan, addLink } from "../../core/copies.js";

const writable = (ctx) => ctx.state.books.filter((b) => !b.readOnly && !b.remote);
const bookName = (ctx, id) => ctx.state.books.find((b) => b.id === id)?.name ?? "another address book";
const bookIds = (group) => [...new Set(group.cards.map((c) => c.parentId))];
const rowKey = (group) => `copies:${group.uid}`;
const names = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] ?? "");

/** Every group of copies with a card in a checked address book; `left` says whether it was left as is. */
export function copyGroups(ctx) {
  const excluded = ctx.excludedBooks();
  const left = ctx.state.copiesLeft;
  return findCopies(ctx.state.allCards ?? [])
    .filter((g) => g.cards.some((c) => !excluded.has(c.parentId)))
    .map((g) => ({ ...g, left: left.has(g.uid), name: label(g.cards.find((c) => !c.shadowed) ?? g.cards[0]) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The copy Thunderbird lets add-ons change (it holds this add-on's earlier changes). */
const reachable = (group) => group.cards.find((c) => !c.shadowed) ?? group.cards[0];

/** The mailing lists a card is in (names), in its own address book. */
function listsOf(ctx, card) {
  const book = ctx.state.books.find((b) => b.id === card.parentId);
  return (book?.lists ?? []).filter((l) => l.members.includes(card.uid)).map((l) => l.name);
}

/** The choice for a box (one contact, or every contact in the same books), made on first use. */
function choiceFor(ctx, key, group) {
  if (!ctx.state.copiesChoice.has(key)) {
    ctx.state.copiesChoice.set(key, { action: "leave", keeperBook: reachable(group).parentId, label: null, lists: true });
  }
  return ctx.state.copiesChoice.get(key);
}

/** The labels a "keep" choice gives the kept card: the other books' names (or what was typed), and their mailing lists. */
function keepLabels(ctx, group, choice, book) {
  const others = group.cards.filter((c) => c.parentId !== book);
  const typed = choice.label ?? [...new Set(others.map((c) => bookName(ctx, c.parentId)))].join(", ");
  const labels = typed.split(",").map((s) => s.trim()).filter(Boolean);
  return choice.lists ? [...labels, ...others.flatMap((c) => listsOf(ctx, c))] : labels;
}

function planFor(ctx, group, choice) {
  if (choice.action.startsWith("keep:")) {
    const book = choice.action.slice(5);
    const keeper = group.cards.find((c) => c.parentId === book);
    return copiesPlan(group, "keep", { keeper: keeper.id, labels: keepLabels(ctx, group, choice, book) });
  }
  const keeper = group.cards.find((c) => c.parentId === choice.keeperBook) ?? reachable(group);
  return copiesPlan(group, choice.action, { keeper: keeper.id });
}

/** What a choice does, in words, for the question before applying. */
function explain(ctx, groups, choice) {
  const group = groups[0];
  const books = bookIds(group).map((id) => bookName(ctx, id));
  const first = bookName(ctx, reachable(group).parentId);
  const lines = [];
  if (choice.action === "link") {
    lines.push(`Each copy gets its own contact ID. Thunderbird lets add-ons reach the copy in ${first} first, so that copy is made again in ${first} with a new ID (same details, same mailing lists) and the old one is removed.`);
    lines.push(`Then the copies in ${names(books)} each get every detail of both (where they differ, the copy in ${bookName(ctx, choice.keeperBook)} wins), and they're linked: an edit you make in Contacts Cleanup to one is made to the others. Edits in Thunderbird's own Address Book aren't followed; the editor offers to copy them over.`);
  } else if (choice.action.startsWith("keep:")) {
    const book = choice.action.slice(5);
    const others = bookIds(group).filter((id) => id !== book).map((id) => bookName(ctx, id));
    const labels = keepLabels(ctx, group, choice, book);
    lines.push(`The copy in ${bookName(ctx, book)} stays and gets the other copies' details${labels.length ? `, with the label${labels.length > 1 ? "s" : ""} ${names([...new Set(labels)])}` : ""}.`);
    lines.push(`The copies in ${names(others)} are deleted, and leave their mailing lists there.`);
  } else {
    lines.push(`Each copy gets its own contact ID and keeps its own details. From then on they're two contacts, edited apart. The copy in ${first} is made again with a new ID (same details, same mailing lists).`);
  }
  lines.push("Undo (the message after, or Changes) puts the details and mailing lists back. The copies keep separate IDs: Thunderbird doesn't let add-ons give two contacts one ID again.");
  return lines;
}

async function applyChoice(ctx, groups, choice) {
  if (choice.action === "leave") {
    await ctx.leaveCopies(groups.map((g) => g.uid), true);
    ctx.toast(`${plural(groups.length, "contact", "contacts")} left as is. "Show the ones left as is" brings them back here.`);
    return;
  }
  const go = await ctx.confirm({
    title: `${groups.length > 1 ? `${groups.length} contacts` : groups[0].name}: ${choice.action === "link" ? "link the copies" : choice.action === "separate" ? "separate the copies" : `keep the copy in ${bookName(ctx, choice.action.slice(5))}`}?`,
    body: explain(ctx, groups, choice).map((text) => h("p", {}, text)),
    ok: groups.length > 1 ? `Apply to ${groups.length}` : "Apply",
  });
  if (!go) {
    return;
  }
  const plans = groups.map((g) => planFor(ctx, g, choice));
  const what = choice.action === "link" ? "linked the copies" : choice.action === "separate" ? "separated the copies" : `kept the copy in ${bookName(ctx, choice.action.slice(5))}`;
  await ctx.apply(`${groups.length > 1 ? plural(groups.length, "contact", "contacts") : groups[0].name}: ${what}`, groups.map((g, i) => ({
    type: "copies", uid: g.uid, books: bookIds(g), want: plans[i].want, label: g.name,
  })), {
    onDone: async (results) => {
      if (choice.action === "link") {
        let links = ctx.state.links;
        for (const ids of results) {
          if (Array.isArray(ids) && ids.length > 1) {
            links = addLink(links, ids);
          }
        }
        await ctx.saveLinks(links);
      }
    },
  });
  ctx.state.selected = null;
  ctx.render();
}

/** The choice and its Apply button, for one contact or every contact in `groups` (all in the same address books). */
function controls(ctx, key, groups) {
  const group = groups[0];
  const choice = choiceFor(ctx, key, group);
  const books = bookIds(group);
  const options = [
    ["leave", "Leave as is"],
    ["link", "Link the copies: editing one edits the others"],
    ...books.map((b) => [`keep:${b}`, `Keep the copy in ${bookName(ctx, b)}, label it, delete the others`]),
    ["separate", "Separate them: two contacts, edited apart"],
  ];
  const keepBook = choice.action.startsWith("keep:") ? choice.action.slice(5) : null;
  const removedLists = keepBook ? [...new Set(groups.flatMap((g) => g.cards.filter((c) => c.parentId !== keepBook).flatMap((c) => listsOf(ctx, c))))] : [];
  return h("div", { class: "copies-controls" },
    h("select", { "aria-label": "What to do", onChange: (e) => {
      choice.action = e.target.value;
      choice.label = null;
      ctx.render();
    } }, options.map(([value, text]) => h("option", { value, selected: choice.action === value }, text))),
    choice.action === "link"
      ? h("label", {}, "Where they differ, use the copy in ",
        h("select", { onChange: (e) => {
          choice.keeperBook = e.target.value;
        } }, books.map((b) => h("option", { value: b, selected: choice.keeperBook === b }, bookName(ctx, b)))))
      : null,
    keepBook
      ? [
        h("label", {}, "Label: ", h("input", { type: "text", id: `copies-label-${key}`, value: keepLabels(ctx, group, { ...choice, lists: false }, keepBook).join(", "), onInput: (e) => {
          choice.label = e.target.value;
        } })),
        removedLists.length
          ? h("label", {}, h("input", { type: "checkbox", checked: choice.lists, onChange: (e) => {
            choice.lists = e.target.checked;
          } }), `Also label them with their mailing lists (${removedLists.join(", ")})`)
          : null,
      ]
      : null,
    h("button", { class: choice.action === "leave" ? "" : "primary", disabled: Boolean(ctx.state.busy), onClick: () => applyChoice(ctx, groups, choice) },
      choice.action === "leave" ? (groups.length > 1 ? `Leave ${groups.length} as is` : "Leave as is") : groups.length > 1 ? `Apply to ${groups.length}` : "Apply"));
}

function visible(ctx) {
  const showLeft = ctx.state.copiesShowLeft;
  return copyGroups(ctx).filter((g) => (showLeft || !g.left) && g.cards.some((c) => matches(c, ctx.state.search)));
}

export default {
  id: "copies",
  title: "In several books",
  dot: "#d0605e",

  count: (ctx) => copyGroups(ctx).filter((g) => !g.left).length,

  main(ctx) {
    const groups = visible(ctx);
    const open = groups.filter((g) => !g.left);
    // One box per set of address books, for every contact in them at once.
    const sets = new Map();
    for (const g of open) {
      sets.set(booksKey(g), [...(sets.get(booksKey(g)) ?? []), g]);
    }
    const leftCount = copyGroups(ctx).filter((g) => g.left).length;
    return [
      toolbar(ctx, { title: "In several address books" }),
      h("div", { class: "toolbar-filters" },
        h("span", {}, "The same contact in more than one address book, with one contact ID. Thunderbird lets add-ons change only one of the copies, so other pages can't fix the rest. Choose what to do with them, one at a time (select a contact) or all at once (below)."),
        leftCount
          ? h("label", { class: "right" }, h("input", { type: "checkbox", checked: ctx.state.copiesShowLeft, onChange: (e) => {
            ctx.state.copiesShowLeft = e.target.checked;
            ctx.render();
          } }), `Show the ones left as is (${leftCount})`)
          : null),
      [...sets].map(([key, list]) => h("div", { class: "copies-box" },
        h("div", { class: "copies-box-title" }, `${plural(list.length, "contact is", "contacts are")} in both ${names(bookIds(list[0]).map((id) => bookName(ctx, id)))}.`),
        controls(ctx, `set:${key}`, list))),
      virtualList("copies", groups, (g) => {
        const diff = differences(g.cards);
        return row(ctx, {
          key: rowKey(g),
          lead: avatar(reachable(g)),
          title: g.name,
          meta: [
            h("span", {}, names(bookIds(g).map((id) => bookName(ctx, id)))),
            diff.length ? h("span", {}, `${names(diff)} differ`) : h("span", {}, "the same details"),
            g.left ? tag("left as is", "plain") : null,
          ],
        });
      }, { empty: emptyState(ctx.state.search ? "Nothing matches the search." : "No contact is in two address books.", ctx.state.search ? "" : "A contact copied into another address book with its contact ID shows here.") }),
    ];
  },

  detail(ctx) {
    const group = copyGroups(ctx).find((g) => rowKey(g) === ctx.state.selected);
    if (!group) {
      return [
        h("h3", {}, "In several address books"),
        h("p", {}, "These contacts are in more than one address book with the same contact ID, often because one book was imported from another. Thunderbird lets add-ons change only one of the copies (marked \"can't change\" on the other pages)."),
        h("h4", {}, "What you can do"),
        h("ul", {},
          h("li", {}, h("strong", {}, "Leave as is: "), "nothing changes; this page stops asking."),
          h("li", {}, h("strong", {}, "Link the copies: "), "each copy gets its own ID and stays in its address book and mailing lists. They get the same details, and an edit in Contacts Cleanup to one is made to the others."),
          h("li", {}, h("strong", {}, "Keep one copy: "), "it gets the other copies' details, and their address books (and mailing lists) become labels on it. The other copies are deleted."),
          h("li", {}, h("strong", {}, "Separate them: "), "each copy gets its own ID and keeps its own details; two contacts from then on.")),
        h("p", {}, "To make a whole address book or mailing list a label, see Lists to labels."),
        h("div", { class: "no-selection" }, "Select a contact to see its copies."),
      ];
    }
    const diff = differences(group.cards);
    return [
      h("h3", {}, group.name),
      h("p", {}, diff.length ? `The copies differ in: ${names(diff)}.` : "The copies have the same details."),
      group.cards.map((card) => h("div", { style: { marginBottom: "12px" } },
        cardSummary(card),
        h("p", { class: "cp-hint" }, card.shadowed ? "Thunderbird doesn't let add-ons change this copy now." : "The copy add-ons can change now."),
        listsOf(ctx, card).length ? h("p", { class: "cp-hint" }, `In the mailing list${listsOf(ctx, card).length > 1 ? "s" : ""} ${names(listsOf(ctx, card))}.`) : null)),
      h("h4", {}, "What to do"),
      controls(ctx, `one:${group.uid}`, [group]),
      group.left
        ? h("div", { class: "detail-actions" }, h("button", { onClick: () => ctx.leaveCopies([group.uid], false) }, "Ask about it again"))
        : null,
    ];
  },
};
