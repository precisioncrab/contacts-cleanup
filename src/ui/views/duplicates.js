/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Duplicates: groups of cards that look like the same person, and the
 * page that sorts a group into people and merges each person's cards.
 *
 * A group can hold several people (a shared home number, a shared name),
 * so every card gets a person picker, pre-sorted from the strong matches
 * (src/core/duplicates.js suggestPeople). Each person with two or more
 * cards gets a merge editor (pick the card to keep and what it keeps, as
 * in Daynizer's merge screen). Apply merges every person at once and
 * keeps the people apart, as one change that Undo reverses.
 */

import { h, plural } from "../dom.js";
import { toolbar, row, avatar, cardSummary, emptyState, matches, tag } from "../parts.js";
import { label } from "../../core/card.js";
import { mergeOptions, mergeVCard, pairKey, groupLinks, apartPairs, personName } from "../../core/duplicates.js";

const groupKey = (group) => group.cards.map((c) => c.id).sort().join("|");

const PERSON_COLORS = ["#4a90d9", "#e8a23d", "#2f9e55", "#9b6dd6", "#20a39e", "#d1343a", "#b07d3a", "#7b8794"];
const personColor = (n) => PERSON_COLORS[(n - 1) % PERSON_COLORS.length];
const personDot = (n) => h("span", { class: "sidebar-dot", style: { background: personColor(n) } });

/** How many people a suggestion or a sort has. */
const peopleCount = (assign) => new Set(Object.values(assign)).size;

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

/** Opens a group's page, sorted the way suggestPeople guessed. */
function openGroup(ctx, group) {
  ctx.state.merge = { key: groupKey(group), assign: { ...group.suggested }, active: 1, people: {} };
  ctx.state.selected = null;
  ctx.render();
}

/** person number -> its cards, in number order. */
function peopleOf(m, cards) {
  const people = new Map();
  for (const card of cards) {
    const n = m.assign[card.id];
    people.set(n, [...(people.get(n) ?? []), card]);
  }
  return new Map([...people].sort((a, b) => a[0] - b[0]));
}

/** Name, single fields and note as the kept card has them (the first value otherwise); every value kept. */
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
    multi,
    note: (options.notes.find((n) => n.from === keeperId) ?? options.notes[0])?.text ?? "",
  };
}

/** A person's merge editor state, made again when its cards change. */
function editorFor(m, n, cards) {
  const sig = cards.map((c) => c.id).sort().join("|");
  if (m.people[n]?.sig !== sig) {
    const options = mergeOptions(cards);
    m.people[n] = { sig, options, ...defaultsFor(cards, options, options.keeper) };
  }
  return m.people[n];
}

/** "same phone as Pat Roe (555-222-3333)", for each card the given card links to. */
function linkText(card, links) {
  const kinds = { email: "same email", phone: "same phone", chat: "same chat address", name: "same name" };
  const parts = [];
  for (const link of links) {
    const other = link.a === card ? link.b : link.b === card ? link.a : null;
    if (other) {
      const what = link.shared.map((s) => (s.kind === "name" ? kinds.name : `${kinds[s.kind]} ${s.value}`)).join(", ");
      parts.push(`${what} as ${label(other)}`);
    }
  }
  return parts.length > 3 ? [...parts.slice(0, 3), `and ${parts.length - 3} more`].join("; ") : parts.join("; ");
}

/** What Apply will do, person by person. */
function plan(m, cards) {
  const people = peopleOf(m, cards);
  const merges = [...people].filter(([, members]) => members.length > 1);
  return { people, merges };
}

async function applyGroup(ctx, group) {
  const m = ctx.state.merge;
  const { people, merges } = plan(m, group.cards);
  const apart = apartPairs(m.assign).filter((p) => !ctx.state.dismissed.has(p));
  const changes = [];
  const names = [];
  for (const [n, members] of merges) {
    const ed = editorFor(m, n, members);
    const keeper = members.find((c) => c.id === ed.keeperId) ?? members[0];
    const name = ed.name.trim() || label(keeper);
    names.push(name);
    changes.push(
      { type: "update", id: keeper.id, vCard: mergeVCard(members, keeper.id, { name, multi: ed.multi, single: ed.single, note: ed.note }), label: name },
      ...members.filter((c) => c !== keeper).map((c) => ({ type: "delete", id: c.id, label: label(c) })),
    );
  }
  if (!changes.length) {
    ctx.state.merge = null;
    await ctx.dismiss(apart);
    return;
  }
  const title = people.size === 1
    ? `Merged ${plural(group.cards.length, "card", "cards")} into ${names[0]}`
    : `Sorted ${plural(group.cards.length, "card", "cards")} into ${plural(people.size, "person", "people")}: merged ${names.join(", ")}`;
  const entry = await ctx.apply(title, changes, { dismissed: apart });
  if (entry) {
    ctx.state.merge = null;
    ctx.state.selected = null;
    ctx.render();
  }
}

/** What each person is called: its fullest name, numbered when two people share one. */
function personNames(people) {
  const names = new Map();
  const used = new Map();
  for (const [n, members] of people) {
    const name = personName(members);
    used.set(name, (used.get(name) ?? 0) + 1);
    names.set(n, used.get(name) > 1 ? `${name} (${used.get(name)})` : name);
  }
  return names;
}

/** "Move to..." for one card: another person, or a new one. */
function movePicker(ctx, m, card, people, names) {
  const here = m.assign[card.id];
  const next = Math.max(...people.keys()) + 1;
  return h("select", {
    class: "move-select",
    "aria-label": `Move ${label(card)} to another person`,
    onClick: (e) => e.stopPropagation(),
    onChange: (e) => {
      m.assign[card.id] = Number(e.target.value);
      m.active = m.assign[card.id];
      ctx.render();
    },
  },
  h("option", { value: "", selected: true, disabled: true }, "Move to…"),
  [...people.keys()].filter((n) => n !== here).map((n) => h("option", { value: n }, names.get(n))),
  people.get(here).length > 1 ? h("option", { value: next }, "A new person (its own card)") : null);
}

/** One column per person, its cards in it. */
function sortSection(ctx, m, group, people, links, names) {
  return h("div", { class: "page-section" },
    h("div", { class: "label" }, people.size > 1 ? "1. Who is who" : "1. Is it one person?"),
    h("div", { class: "people-board" },
      [...people].map(([n, members]) => h("div", { class: "person", style: { borderTopColor: personColor(n) } },
        h("div", { class: "person-head" },
          personDot(n),
          h("strong", {}, names.get(n)),
          h("span", { class: "from" }, members.length > 1 ? `${members.length} cards, merged into one` : "1 card, left as it is")),
        members.map((card) => h("div", { class: "person-card" },
          avatar(card),
          h("div", { class: "title-col" },
            h("div", { class: "title" }, label(card)),
            h("div", { class: "book" }, card.bookName),
            h("div", { class: "meta" }, linkText(card, links) || "shares nothing with the others"),
            people.size > 1 || members.length > 1 ? movePicker(ctx, m, card, people, names) : null)))))));
}

function editorSection(ctx, m, group, people, names) {
  const merges = [...people].filter(([, members]) => members.length > 1);
  if (!merges.length) {
    return h("div", { class: "page-section" },
      h("div", { class: "label" }, "2. Merge"),
      h("div", { class: "notice" }, "Nothing to merge: every card is a different person and stays as it is. Keep them apart marks them as not duplicates, so this group won't come back."));
  }
  if (!merges.some(([n]) => n === m.active)) {
    m.active = merges[0][0];
  }
  const members = people.get(m.active);
  const ed = editorFor(m, m.active, members);
  const cards = group.cards;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const manyBooks = new Set(members.map((c) => c.bookName)).size > 1;
  const from = (id) => `from ${label(byId.get(id))}${manyBooks ? `, ${byId.get(id).bookName}` : ""}`;
  const others = members.filter((c) => c.id !== ed.keeperId);
  const books = [...new Set(others.map((c) => c.bookName))];
  const section = (title, ...body) => h("div", { class: "page-section" }, h("div", { class: "label" }, title), body);

  return [
    h("div", { class: "page-section" },
      h("div", { class: "label" }, merges.length > 1 ? "2. Merge each person (one tab per person)" : `2. Merge ${names.get(m.active)}'s cards`),
      merges.length > 1
        ? h("div", { class: "view-tabs person-tabs" }, merges.map(([n]) => h("button", {
          class: n === m.active ? "active" : "",
          onClick: () => {
            m.active = n;
            ctx.render();
          },
        }, personDot(n), ` ${names.get(n)}`)))
        : null),

    section("Keep this card",
      members.map((card) => h("div", { class: "choice" },
        h("input", {
          type: "checkbox",
          checked: true,
          title: "In this merge. Uncheck to leave this card out (it becomes a person of its own).",
          "aria-label": `Include ${label(card)} in this merge`,
          onChange: () => {
            m.assign[card.id] = Math.max(...Object.values(m.assign)) + 1;
            ctx.render();
          },
        }),
        h("input", {
          type: "radio",
          name: `keeper-${m.active}`,
          checked: ed.keeperId === card.id,
          "aria-label": `Keep ${label(card)}`,
          onChange: () => {
            Object.assign(ed, defaultsFor(members, ed.options, card.id), { multi: ed.multi, name: ed.name });
            ctx.render();
          },
        }),
        avatar(card),
        h("strong", {}, label(card)),
        h("span", { class: "from" }, card.bookName),
        card.hasPhoto && tag("photo", "plain"))),
      h("p", { class: "hint" },
        `The other ${others.length === 1 ? "card is" : "cards are"} deleted from ${books.join(" and ")}. An address book that syncs with a server (CardDAV) deletes ${others.length === 1 ? "it" : "them"} there too. Undo brings ${others.length === 1 ? "it" : "them"} back. Uncheck a card to leave it out of this merge.`)),

    section("Name",
      h("input", { type: "text", id: `merge-name-${m.active}`, value: ed.name, list: "merge-names", onInput: (e) => {
        ed.name = e.target.value;
      } }),
      h("datalist", { id: "merge-names" }, ed.options.names.map((n) => h("option", { value: n })))),

    ed.options.multi.map((field) => section(field.label,
      field.values.map((v) => h("label", { class: "choice" },
        h("input", {
          type: "checkbox",
          checked: ed.multi[field.name]?.has(v.key),
          onChange: (e) => {
            ed.multi[field.name][e.target.checked ? "add" : "delete"](v.key);
          },
        }),
        h("span", {}, v.text),
        h("span", { class: "from" }, from(v.from)))))),

    ed.options.single.map((field) => section(field.label,
      h("select", { onChange: (e) => {
        ed.single[field.name] = e.target.value;
      } },
      h("option", { value: "", selected: !ed.single[field.name] }, "(none)"),
      field.values.map((v) => h("option", { value: v.text, selected: ed.single[field.name] === v.text }, `${v.text}  (${from(v.from)})`))))),

    section("Note",
      h("textarea", { id: `merge-note-${m.active}`, value: ed.note, onInput: (e) => {
        ed.note = e.target.value;
      } }),
      ed.options.notes.filter((n) => n.from !== ed.keeperId && !ed.note.includes(n.text)).map((n) => h("div", {},
        h("button", { class: "link", style: { marginTop: "6px" }, onClick: () => {
          ed.note = ed.note ? `${ed.note}\n\n${n.text}` : n.text;
          ctx.render();
        } }, `+ Add the note ${from(n.from)}`)))),

    ed.options.categories.length
      ? section("Categories", h("p", { class: "hint" }, `All kept: ${ed.options.categories.join(", ")}`))
      : null,

    h("div", { class: "notice" }, "Everything else on the cards (photos, other fields) stays on the card you keep, and fields only the other cards have are added to it."),
  ];
}

function groupPage(ctx, group) {
  const m = ctx.state.merge;
  // Cards that left the group since (edited elsewhere) drop out; new ones start as their own person.
  for (const card of group.cards) {
    if (!(card.id in m.assign)) {
      m.assign[card.id] = Math.max(0, ...Object.values(m.assign)) + 1;
    }
  }
  for (const id of Object.keys(m.assign)) {
    if (!group.cards.some((c) => c.id === id)) {
      delete m.assign[id];
    }
  }
  const { people, merges } = plan(m, group.cards);
  const links = groupLinks(group.cards);
  const names = personNames(people);
  const one = people.size === 1;
  const count = plural(group.cards.length, "card", "cards");
  const intro = one
    ? `These ${count} look like one person, ${names.get([...people.keys()][0])}. They're grouped because they share details (shown under each card). If a card belongs to someone else, use its Move to menu: it gets a column of its own. Then check what the merged card keeps (step 2) and click Merge into one.`
    : `These ${count} share details (shown under each card), but look like ${people.size} different people: one column each. If a card is in the wrong column, use its Move to menu. Each person's cards are merged into one card; a person with one card is left as it is. Then check each merge (step 2) and click Apply.`;
  const summary = [...people].map(([n, members]) => (members.length > 1 ? `${names.get(n)}: ${members.length} cards into one` : `${names.get(n)}: left as it is`)).join(". ");
  return [
    h("div", { class: "toolbar" },
      h("button", { onClick: () => {
        ctx.state.merge = null;
        ctx.render();
      } }, "‹ Back"),
      h("h2", { style: { flex: "1" } }, one ? `Merge ${count}` : `Who is who: ${count}`),
      h("button", { class: "primary", disabled: Boolean(ctx.state.busy), onClick: () => applyGroup(ctx, group) },
        ctx.state.busy ? "Saving…" : one ? "Merge into one" : merges.length ? "Apply" : "Keep them apart")),
    one ? null : h("div", { class: "toolbar-filters" }, h("span", {}, `${summary}.`)),
    h("div", { class: "page", "data-scroll": "merge" },
      h("div", { class: "notice intro" }, intro),
      sortSection(ctx, m, group, people, links, names),
      editorSection(ctx, m, group, people, names)),
  ];
}

export default {
  id: "duplicates",
  title: "Duplicates",
  dot: "#e8a23d",

  count: (ctx) => ctx.derived.duplicates.length,

  main(ctx) {
    const open = ctx.state.merge && ctx.derived.duplicates.find((g) => groupKey(g) === ctx.state.merge.key);
    if (open) {
      return groupPage(ctx, open);
    }
    const groups = visibleGroups(ctx);
    const across = Boolean(ctx.state.settings.duplicatesAcrossBooks);
    return [
      toolbar(ctx, { title: "Duplicates" }),
      h("div", { class: "toolbar-filters" },
        h("label", { title: "Off: the same person in two address books (a synced book and a local one, say) isn't a duplicate." },
          h("input", { type: "checkbox", checked: across, onChange: (e) => ctx.saveSettings({ duplicatesAcrossBooks: e.target.checked }) }),
          "Also match cards in different address books"),
        h("span", {}, across ? "Merging across address books deletes cards from the other books." : "Only cards in the same address book are compared.")),
      h("div", { class: "list", "data-scroll": "list" },
        groups.length === 0
          ? emptyState(ctx.state.search ? "Nothing matches the search." : "No duplicates found.", ctx.state.search ? "" : `Cards in ${across ? "your address books" : "the same address book"} with the same email address, phone number, chat address or name show here.`)
          : groups.map((group) => {
            const count = peopleCount(group.suggested);
            return row(ctx, {
              key: groupKey(group),
              lead: h("div", { class: "avatars" }, group.cards.slice(0, 3).map((c) => avatar(c))),
              title: [...new Set(group.cards.map(label))].join(", "),
              meta: [
                h("span", {}, plural(group.cards.length, "card", "cards")),
                count > 1 ? tag(`looks like ${count} people`, "warn") : group.cards.length > 2 ? tag("looks like 1 person", "plain") : null,
                h("span", {}, group.reasons.join(", ")),
                new Set(group.cards.map((c) => c.bookName)).size > 1 ? h("span", {}, [...new Set(group.cards.map((c) => c.bookName))].join(" and ")) : null,
              ],
              actions: [
                h("button", { class: "primary", disabled: Boolean(ctx.state.busy), onClick: () => openGroup(ctx, group) }, count > 1 || group.cards.length > 2 ? "Sort and merge" : "Review and merge"),
                h("button", { onClick: () => dismiss(ctx, group) }, "Not duplicates"),
              ],
            });
          })),
    ];
  },

  detail(ctx) {
    if (ctx.state.merge) {
      return [
        h("h3", {}, "How this page works"),
        h("ol", {},
          h("li", {}, "Each column is one person, with the cards that belong to them. Under each card: what it shares, and with whom."),
          h("li", {}, "A card in the wrong column? Its Move to menu puts it with another person, or gives it a column of its own."),
          h("li", {}, "Step 2 shows what each merged card keeps: every value starts checked."),
          h("li", {}, "Apply (or Merge into one) merges each column into one card. A column with one card is left as it is. People in different columns won't be grouped again."),
          h("li", {}, "Undo (Edit > Undo, or Changes) puts every card back.")),
        h("h4", {}, "How the columns were guessed"),
        h("p", {}, "Cards go together on the strongest matches: the same email or chat address, or the same phone number with a matching first name (Sam and Sammy, J and Jane), or the same full name. A shared home number with different first names, a shared family name, or a one-word name like Mom starts as separate people. Two people whose names clash are never put together."),
      ];
    }
    const group = ctx.derived.duplicates.find((g) => groupKey(g) === ctx.state.selected);
    if (!group) {
      return [
        h("h3", {}, "Duplicates"),
        h("p", {}, "Cards in the same address book that look like the same person: the same email address, phone number (in any format) or chat address, or the same name. The same person in two address books isn't a duplicate, unless you check Also match cards in different address books."),
        h("p", {}, "A group can hold more than one person, for example a family sharing a home number. Sort and merge lets you say who is who, then merges each person's cards."),
        h("p", {}, "Not duplicates hides a whole group for good."),
        h("div", { class: "no-selection" }, "Select a group to see its cards."),
      ];
    }
    const m = { assign: group.suggested };
    const people = peopleOf(m, group.cards);
    return [
      h("h3", {}, people.size > 1 ? `${plural(group.cards.length, "card", "cards")}, looks like ${people.size} people` : `${plural(group.cards.length, "card", "cards")}: ${group.reasons.join(", ")}`),
      [...people].map(([n, members]) => [
        people.size > 1 ? h("h4", { class: "person-head" }, personDot(n), ` ${personName(members)}`) : null,
        members.map((card) => h("div", { style: { marginBottom: "12px" } }, cardSummary(card))),
      ]),
      h("div", { class: "detail-actions" },
        h("button", { class: "primary", disabled: Boolean(ctx.state.busy), onClick: () => openGroup(ctx, group) }, people.size > 1 || group.cards.length > 2 ? "Sort and merge" : "Review and merge"),
        h("button", { onClick: () => dismiss(ctx, group) }, "Not duplicates")),
    ];
  },
};
