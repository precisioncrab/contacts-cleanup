/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Pieces every view uses: toolbar, search, rows, avatars, card summaries, help text. */

import { h } from "./dom.js";
import { label, initials, avatarColor } from "../core/card.js";

export function avatar(card, big = false) {
  return h("div", { class: `avatar${big ? " big" : ""}`, style: { background: avatarColor(card) }, "aria-hidden": "true" }, initials(card));
}

/** The toolbar: title, optional search box, extra controls, and the primary button. */
export function toolbar(ctx, { title, search = true, primary, extra = [] }) {
  return h("div", { class: "toolbar" },
    h("h2", {}, title),
    search
      ? h("input", {
        type: "search",
        id: "search",
        class: "search-box",
        placeholder: "Search names, numbers, addresses",
        value: ctx.state.search,
        onInput: (e) => {
          ctx.state.search = e.target.value;
          ctx.render();
        },
      })
      : h("div", { class: "spacer" }),
    extra,
    primary && h("button", { class: "primary", disabled: primary.disabled || Boolean(ctx.state.busy), onClick: primary.onClick }, primary.label));
}

/** A "Select all" checkbox for a list of booleans: checked, empty, or in between. */
export function selectAll(text, states, onChange) {
  const on = states.filter(Boolean).length;
  return h("label", {},
    h("input", {
      type: "checkbox",
      checked: on > 0 && on === states.length,
      indeterminate: on > 0 && on < states.length,
      disabled: states.length === 0,
      onChange: (e) => onChange(e.target.checked),
    }),
    text);
}

/** One list row. `check` is { checked, disabled, onChange, title } or null. */
export function row(ctx, { key, check, lead, title, meta = [], actions = [], muted = false }) {
  return h("div", {
    class: `row${ctx.state.selected === key ? " selected" : ""}${muted ? " muted" : ""}`,
    onClick: () => ctx.select(key),
  },
  check && h("input", {
    type: "checkbox",
    checked: check.checked,
    disabled: check.disabled || Boolean(ctx.state.busy),
    title: check.title,
    "aria-label": check.title ?? "Include",
    onClick: (e) => e.stopPropagation(),
    onChange: (e) => check.onChange(e.target.checked),
  }),
  lead,
  h("div", { class: "title-col" },
    typeof title === "string" ? h("div", { class: "title" }, title) : title,
    meta.length ? h("div", { class: "meta" }, meta) : null),
  actions.length ? h("div", { class: "actions", onClick: (e) => e.stopPropagation() }, actions) : null);
}

/** "from -> to", for a proposed change; `replaced` false when `from` stays (a number and the address made from it). */
export function change(from, to, replaced = true) {
  return h("span", { class: "change" },
    from ? h("span", { class: replaced ? "from" : "source" }, from) : null,
    from ? h("span", { class: "arrow" }, "→") : null,
    h("span", { class: "to" }, to));
}

export const tag = (text, kind = "") => h("span", { class: `tag${kind ? ` ${kind}` : ""}` }, text);

export function emptyState(big, text) {
  return h("div", { class: "empty-state" }, h("div", { class: "big" }, big), text);
}

/** A card's name, book and fields, for the detail panel. */
export function cardSummary(card) {
  const fields = [
    ...card.phones.map((p) => ["Phone", p.value + (p.mobile ? " (mobile)" : "")]),
    ...card.emails.map((e) => ["Email", e.address]),
    ...card.chat.map((c) => ["Chat", c.kind === "xmpp" ? `xmpp:${c.address}` : `${c.address} (${c.kind === "x-jabber" ? "X-JABBER" : "no xmpp:"})`]),
    ...(card.org ? [["Org", card.org]] : []),
  ];
  return [
    h("div", { class: "detail-head" },
      avatar(card, true),
      h("div", { class: "who" },
        h("div", { class: "name" }, label(card)),
        h("div", { class: "book" }, card.bookName))),
    fields.length
      ? h("ul", { class: "field-list" }, fields.map(([kind, value]) => h("li", {}, h("span", { class: "kind" }, kind), h("span", {}, value))))
      : h("p", {}, "No phone numbers or addresses on this card."),
  ];
}

/** Help text: [[term, explanation], ...] under a heading. */
export function help(heading, entries) {
  return h("div", { class: "help" },
    h("h4", {}, heading),
    h("dl", {}, entries.map(([term, text]) => [h("dt", {}, term), h("dd", {}, text)])));
}

/** Whether a card matches the search box: name, organization, emails, chat addresses, or numbers (digits). */
export function matches(card, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) {
    return true;
  }
  const text = [label(card), card.name, card.org, card.nickname, ...card.emails.map((e) => e.address), ...card.chat.map((c) => c.address)]
    .join(" ").toLowerCase();
  if (text.includes(q)) {
    return true;
  }
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && card.phones.some((p) => p.value.replace(/\D/g, "").includes(digits));
}
