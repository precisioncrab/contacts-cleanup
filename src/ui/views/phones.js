/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Phone numbers: every number in one format, each change checked or not before applying. */

import { h, plural } from "../dom.js";
import { toolbar, row, change, cardSummary, emptyState, selectAll, matches, tag, pendingBar } from "../parts.js";
import { openEditor } from "../card-editor.js";
import { label } from "../../core/card.js";
import { applyPhoneFixes } from "../../core/fixes.js";
import { COUNTRIES } from "../../core/phone.js";

const fixKey = (card, fix) => `${card.id}:${fix.index}`;

const SKIP_REASONS = {
  extension: "has an extension, left as it is",
  unknown: "no country code: pick the country for these numbers above",
};

function visible(ctx) {
  return ctx.derived.phones.filter((p) => matches(p.card, ctx.state.search));
}

function allFixes(ctx) {
  return visible(ctx).flatMap((p) => p.fixes.map((fix) => ({ card: p.card, fix, key: fixKey(p.card, fix) })));
}

async function applyChecked(ctx) {
  const byCard = new Map();
  for (const { card, fix, key } of allFixes(ctx)) {
    if (!ctx.state.phoneOff.has(key)) {
      byCard.set(card, [...(byCard.get(card) ?? []), fix]);
    }
  }
  const changes = [...byCard].map(([card, fixes]) => ({ type: "update", id: card.id, vCard: applyPhoneFixes(card.vCard, fixes), label: label(card) }));
  const numbers = [...byCard.values()].reduce((n, f) => n + f.length, 0);
  await ctx.apply(`Phone numbers: ${plural(numbers, "number", "numbers")} on ${plural(changes.length, "card", "cards")}`, changes);
}

export default {
  id: "phones",
  title: "Phone numbers",
  dot: "#4a90d9",

  count: (ctx) => ctx.derived.phones.reduce((n, p) => n + p.fixes.length, 0),

  main(ctx) {
    const { settings } = ctx.state;
    const fixes = allFixes(ctx);
    const on = fixes.filter((f) => !ctx.state.phoneOff.has(f.key));
    const skipped = visible(ctx).flatMap((p) => p.skipped.map((s) => ({ card: p.card, ...s })));
    return [
      toolbar(ctx, {
        title: "Phone numbers",
        primary: { label: on.length ? `Apply ${plural(on.length, "change", "changes")}` : "Apply", disabled: !on.length, onClick: () => applyChecked(ctx) },
      }),
      h("div", { class: "toolbar-filters" },
        h("label", {}, "Format",
          h("select", { onChange: (e) => ctx.saveSettings({ phoneStyle: e.target.value }) },
            h("option", { value: "international", selected: settings.phoneStyle === "international" }, "+1 555 123 4567 (international)"),
            h("option", { value: "compact", selected: settings.phoneStyle === "compact" }, "+15551234567 (compact)"))),
        h("label", {}, "Numbers without a country code are from",
          h("select", { onChange: (e) => ctx.saveSettings({ country: e.target.value }) },
            COUNTRIES.map((c) => h("option", { value: c.id, selected: settings.country === c.id }, c.label)))),
        h("span", { class: "right" }, selectAll("Select all", fixes.map((f) => !ctx.state.phoneOff.has(f.key)), (checked) => {
          for (const f of fixes) {
            ctx.state.phoneOff[checked ? "delete" : "add"](f.key);
          }
          ctx.render();
        }))),
      h("div", { class: "list", "data-scroll": "list" },
        fixes.length === 0 && skipped.length === 0
          ? emptyState(ctx.state.search ? "Nothing matches the search." : "Every phone number is in this format.", "")
          : [
            fixes.length === 0 ? emptyState("Every number that can be read is in this format.", "") : null,
            fixes.map(({ card, fix, key }) => row(ctx, {
              key: card.id,
              check: {
                checked: !ctx.state.phoneOff.has(key),
                onChange: (checked) => {
                  ctx.state.phoneOff[checked ? "delete" : "add"](key);
                  ctx.render();
                },
              },
              title: label(card),
              meta: [change(fix.from, fix.to), card.phones[fix.index]?.mobile ? tag("mobile", "plain") : null, h("span", {}, card.bookName)],
            })),
            skipped.length ? h("div", { class: "list-heading" }, `Left as they are (${skipped.length})`) : null,
            skipped.map((s) => row(ctx, {
              key: s.card.id,
              muted: true,
              title: label(s.card),
              meta: [h("span", {}, s.value), h("span", {}, SKIP_REASONS[s.reason])],
            })),
          ]),
      on.length
        ? pendingBar(ctx, {
          text: `${plural(on.length, "number is", "numbers are")} checked. Nothing is saved until you click Apply.`,
          applyLabel: `Apply ${plural(on.length, "change", "changes")}`,
          onApply: () => applyChecked(ctx),
        })
        : null,
    ];
  },

  detail(ctx) {
    const entry = ctx.derived.phones.find((p) => p.card.id === ctx.state.selected);
    const about = [
      h("h4", {}, "Why one format"),
      h("p", {}, "Numbers written one way are easy to read and easy to match: other apps, and OMEMO for Thunderbird's chat contact names, find the same person whatever the format. International numbers (with + and the country code) work from anywhere."),
      h("p", {}, "US and Canada numbers are grouped 3-3-4. Other countries' numbers keep the grouping you typed; only the + and the country code are added. Pick the compact format for no spaces at all."),
      h("p", {}, "Only the number changes: its type (mobile, work, home) stays as it was."),
    ];
    if (!entry) {
      return [h("h3", {}, "Phone numbers"), h("p", {}, "Check the changes you want, then Apply. Unchecked numbers stay as they are."), about];
    }
    return [
      cardSummary(entry.card, () => openEditor(ctx, entry.card.id)),
      h("h4", {}, "Proposed"),
      entry.fixes.length
        ? h("ul", { class: "field-list" }, entry.fixes.map((fix) => h("li", {}, change(fix.from, fix.to))))
        : h("p", {}, "Nothing to change."),
      entry.skipped.length
        ? [h("h4", {}, "Left as they are"), h("ul", { class: "field-list" }, entry.skipped.map((s) => h("li", {}, `${s.value}: ${SKIP_REASONS[s.reason]}`)))]
        : null,
      about,
    ];
  },
};
