/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Chat address fixes: chat addresses Thunderbird's card editor refuses
 * (no "xmpp:" in front) or doesn't show (older apps' X-JABBER lines),
 * written the way it wants them.
 */

import { h, plural } from "../dom.js";
import { toolbar, row, cardSummary, emptyState, selectAll, matches, change, pendingBar } from "../parts.js";
import { openEditor } from "../card-editor.js";
import { label } from "../../core/card.js";
import { applyPrefixFixes } from "../../core/chat.js";

const visible = (ctx) => ctx.derived.prefix.filter((p) => matches(p.card, ctx.state.search));
const checked = (ctx) => visible(ctx).filter((p) => !ctx.state.prefixOff.has(p.card.id));

async function applyFixes(ctx) {
  const rows = checked(ctx);
  await ctx.apply(`Chat address fixes: ${plural(rows.length, "card", "cards")}`,
    rows.map((p) => ({ type: "update", id: p.card.id, vCard: applyPrefixFixes(p.card.vCard, p.fixes), label: label(p.card) })));
}

export default {
  id: "fixes",
  title: "Chat address fixes",
  dot: "#2f9e55",

  count: (ctx) => ctx.derived.prefix.length,

  main(ctx) {
    const rows = visible(ctx);
    const on = checked(ctx);
    return [
      toolbar(ctx, {
        title: "Chat address fixes",
        primary: { label: on.length ? `Apply ${plural(on.length, "change", "changes")}` : "Apply", disabled: !on.length, onClick: () => applyFixes(ctx) },
      }),
      h("div", { class: "toolbar-filters" },
        h("span", {}, "Thunderbird's card editor only takes chat addresses written with xmpp: in front."),
        h("span", { class: "right" }, selectAll("Select all", rows.map((p) => !ctx.state.prefixOff.has(p.card.id)), (value) => {
          for (const p of rows) {
            ctx.state.prefixOff[value ? "delete" : "add"](p.card.id);
          }
          ctx.render();
        }))),
      h("div", { class: "list", "data-scroll": "list" },
        rows.length === 0
          ? emptyState(ctx.state.search ? "Nothing matches the search." : "Every chat address is written the way Thunderbird wants it.", "")
          : rows.map((p) => row(ctx, {
            key: p.card.id,
            check: {
              checked: !ctx.state.prefixOff.has(p.card.id),
              onChange: (value) => {
                ctx.state.prefixOff[value ? "delete" : "add"](p.card.id);
                ctx.render();
              },
            },
            title: label(p.card),
            meta: p.fixes.map((fix) => (fix.kind === "noscheme"
              ? change(fix.text, `xmpp:${fix.address}`)
              : h("span", {}, change(`X-JABBER ${fix.address}`, `adds xmpp:${fix.address}`)))),
          }))),
      on.length
        ? pendingBar(ctx, {
          text: `${plural(on.length, "card is", "cards are")} checked. Nothing is saved until you click Apply.`,
          applyLabel: `Apply ${plural(on.length, "change", "changes")}`,
          onApply: () => applyFixes(ctx),
        })
        : null,
    ];
  },

  detail(ctx) {
    const p = ctx.derived.prefix.find((x) => x.card.id === ctx.state.selected);
    return [
      p ? cardSummary(p.card, () => openEditor(ctx, p.card.id)) : h("h3", {}, "Chat address fixes"),
      h("p", {}, "Chat addresses saved by other apps sometimes lack the xmpp: in front, or sit in an older X-JABBER field that Thunderbird doesn't show. Thunderbird's card editor marks those red and won't save the card."),
      h("p", {}, "The fix writes them as xmpp: chat addresses. An X-JABBER field stays as it is, for the apps that read it."),
    ];
  },
};
