/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Chat addresses on cards: a checkbox per phone contact for its JMP.chat
 * address (checked when the card has a chat address), "Select all phone
 * contacts", a "Generate JMP.chat address" button for one person, and
 * fixes for chat addresses Thunderbird can't use.
 */

import { h, plural } from "../dom.js";
import { toolbar, row, cardSummary, emptyState, selectAll, matches, help, tag, change } from "../parts.js";
import { label } from "../../core/card.js";
import { jmpAddress, addChatAddress, removeChatAddress, applyPrefixFixes, normalizeGateway, DEFAULT_GATEWAY } from "../../core/chat.js";
import { LINKS, openLink } from "../../lib/links.js";

export const CHAT_HELP = [
  ["Chat address on a card", "Saved with the contact, like an email address. It goes wherever that address book syncs (your CardDAV server, then your phone and other apps), or nowhere for a local address book. On its own it doesn't add anyone to a chat list."],
  ["JMP.chat address", "A phone number at cheogram.com, like +15551234567@cheogram.com. It only works if your XMPP account is registered with JMP.chat (or another Cheogram gateway); then texts and calls to it reach that phone number as text messages and phone calls."],
  ["Removing a chat address", "Takes it off the card, and off the server the address book syncs with. Contacts Cleanup only removes chat addresses it added itself. Nobody is removed from a chat list."],
];

const gatewayOf = (ctx) => normalizeGateway(ctx.state.settings.gateway) ?? DEFAULT_GATEWAY;
const numberFor = (ctx, item) => ctx.state.chatNumber.get(item.card.id) ?? item.choices[0]?.e164;

/** Whether the row's box shows checked: the card's state, with the user's staged change on top. */
function isChecked(ctx, item) {
  const staged = ctx.state.chatStaged.get(item.card.id);
  if (staged) {
    return staged === "add";
  }
  return item.state === "ours" || item.state === "theirs";
}

function phoneRows(ctx) {
  const filter = ctx.state.chatFilter;
  return ctx.derived.chat.filter((item) => matches(item.card, ctx.state.search)
    && (filter === "all"
      || (filter === "without" && (item.state === "none" || item.state === "no-phone"))
      || (filter === "with" && (item.state === "ours" || item.state === "theirs"))));
}

function stagedChanges(ctx) {
  const gateway = gatewayOf(ctx);
  const changes = [];
  const added = [];
  const removed = [];
  for (const item of ctx.derived.chat) {
    const staged = ctx.state.chatStaged.get(item.card.id);
    if (staged === "add" && item.state === "none") {
      const address = jmpAddress(numberFor(ctx, item), gateway);
      changes.push({ type: "update", id: item.card.id, vCard: addChatAddress(item.card.vCard, address), label: label(item.card) });
      added.push([item.card.id, address]);
    } else if (staged === "remove" && item.state === "ours") {
      let vCard = item.card.vCard;
      for (const address of item.ours) {
        vCard = removeChatAddress(vCard, address);
        removed.push([item.card.id, address]);
      }
      changes.push({ type: "update", id: item.card.id, vCard, label: label(item.card) });
    }
  }
  return { changes, added, removed };
}

async function applyStaged(ctx) {
  const { changes, added, removed } = stagedChanges(ctx);
  const parts = [added.length && `added ${added.length}`, removed.length && `removed ${removed.length}`].filter(Boolean);
  const entry = await ctx.apply(`Chat addresses: ${parts.join(", ")}`, changes, { generated: { added, removed } });
  if (entry) {
    ctx.state.chatStaged.clear();
    ctx.render();
  }
}

/** One person, right away: the "Generate JMP.chat address" button. */
async function generateOne(ctx, item) {
  const address = jmpAddress(numberFor(ctx, item), gatewayOf(ctx));
  ctx.state.chatStaged.delete(item.card.id);
  await ctx.apply(`Chat address for ${label(item.card)}`, [
    { type: "update", id: item.card.id, vCard: addChatAddress(item.card.vCard, address), label: label(item.card) },
  ], { generated: { added: [[item.card.id, address]], removed: [] } });
}

async function removeOne(ctx, item) {
  let vCard = item.card.vCard;
  for (const address of item.ours) {
    vCard = removeChatAddress(vCard, address);
  }
  ctx.state.chatStaged.delete(item.card.id);
  await ctx.apply(`Removed the chat address of ${label(item.card)}`, [
    { type: "update", id: item.card.id, vCard, label: label(item.card) },
  ], { generated: { added: [], removed: item.ours.map((a) => [item.card.id, a]) } });
}

function phoneMeta(ctx, item) {
  const gateway = gatewayOf(ctx);
  const staged = ctx.state.chatStaged.get(item.card.id);
  switch (item.state) {
    case "none": {
      const e164 = numberFor(ctx, item);
      const written = item.choices.find((c) => c.e164 === e164)?.value ?? e164;
      return [
        change(written, jmpAddress(e164, gateway), false),
        item.choices.length > 1 ? tag(`${item.choices.length} numbers`, "plain") : null,
        staged === "add" ? tag("will be added") : null,
      ];
    }
    case "ours":
      return [h("span", {}, item.ours.join(", ")), tag("added by Contacts Cleanup", "plain"), staged === "remove" ? tag("will be removed", "warn") : null];
    case "theirs":
      return [h("span", {}, `Has ${item.addresses.join(", ")}`)];
    default:
      return [h("span", {}, `${item.card.phones[0]?.value ?? ""}: no country code, so no JMP.chat address (see Phone numbers)`)];
  }
}

function phonesTab(ctx) {
  const rows = phoneRows(ctx);
  const addable = ctx.derived.chat.filter((item) => item.state === "none");
  const gatewayValid = Boolean(normalizeGateway(ctx.state.settings.gateway));
  return [
    h("div", { class: "toolbar-filters" },
      h("label", {}, "Gateway",
        h("input", {
          type: "text",
          id: "gateway",
          class: gatewayValid ? "" : "invalid",
          style: { width: "130px" },
          value: ctx.state.settings.gateway,
          title: "JMP.chat's gateway is cheogram.com. Another Cheogram gateway's domain can go here.",
          onChange: (e) => ctx.saveSettings({ gateway: e.target.value.trim() || DEFAULT_GATEWAY }),
        })),
      h("label", {}, "Show",
        h("select", { onChange: (e) => {
          ctx.state.chatFilter = e.target.value;
          ctx.render();
        } },
        h("option", { value: "all", selected: ctx.state.chatFilter === "all" }, "All phone contacts"),
        h("option", { value: "without", selected: ctx.state.chatFilter === "without" }, "Without a chat address"),
        h("option", { value: "with", selected: ctx.state.chatFilter === "with" }, "With a chat address"))),
      h("span", { class: "right" }, selectAll("Select all phone contacts", addable.map((item) => ctx.state.chatStaged.get(item.card.id) === "add"), (checked) => {
        for (const item of addable) {
          if (checked) {
            ctx.state.chatStaged.set(item.card.id, "add");
          } else {
            ctx.state.chatStaged.delete(item.card.id);
          }
        }
        ctx.render();
      }))),
    h("div", { class: "list", "data-scroll": "list" },
      rows.length === 0
        ? emptyState(ctx.state.search ? "Nothing matches the search." : "No contacts with phone numbers here.", "")
        : rows.map((item) => row(ctx, {
          key: item.card.id,
          muted: item.state === "no-phone",
          check: {
            checked: isChecked(ctx, item),
            disabled: item.state === "theirs" || item.state === "no-phone",
            title: item.state === "theirs" ? "This chat address wasn't added by Contacts Cleanup, so it's left alone. Change it in the address book." : "JMP.chat address",
            onChange: (checked) => {
              const original = item.state === "ours";
              if (checked === original) {
                ctx.state.chatStaged.delete(item.card.id);
              } else {
                ctx.state.chatStaged.set(item.card.id, checked ? "add" : "remove");
              }
              ctx.render();
            },
          },
          title: label(item.card),
          meta: phoneMeta(ctx, item),
        }))),
  ];
}

function fixesTab(ctx) {
  const rows = ctx.derived.prefix.filter((p) => matches(p.card, ctx.state.search));
  return [
    h("div", { class: "toolbar-filters" },
      h("span", {}, "Thunderbird's card editor only takes chat addresses written with xmpp: in front."),
      h("span", { class: "right" }, selectAll("Select all", rows.map((p) => !ctx.state.prefixOff.has(p.card.id)), (checked) => {
        for (const p of rows) {
          ctx.state.prefixOff[checked ? "delete" : "add"](p.card.id);
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
            onChange: (checked) => {
              ctx.state.prefixOff[checked ? "delete" : "add"](p.card.id);
              ctx.render();
            },
          },
          title: label(p.card),
          meta: p.fixes.map((fix) => (fix.kind === "noscheme"
            ? change(fix.text, `xmpp:${fix.address}`)
            : h("span", {}, change(`X-JABBER ${fix.address}`, `adds xmpp:${fix.address}`)))),
        }))),
  ];
}

async function applyFixes(ctx) {
  const rows = ctx.derived.prefix.filter((p) => matches(p.card, ctx.state.search) && !ctx.state.prefixOff.has(p.card.id));
  await ctx.apply(`Chat address fixes: ${plural(rows.length, "card", "cards")}`,
    rows.map((p) => ({ type: "update", id: p.card.id, vCard: applyPrefixFixes(p.card.vCard, p.fixes), label: label(p.card) })));
}

export default {
  id: "chat",
  title: "Chat addresses",
  dot: "#2f9e55",

  count: (ctx) => ctx.derived.prefix.length || null,

  main(ctx) {
    const onFixes = ctx.state.chatTab === "fixes";
    const pending = onFixes
      ? ctx.derived.prefix.filter((p) => matches(p.card, ctx.state.search) && !ctx.state.prefixOff.has(p.card.id)).length
      : stagedChanges(ctx).changes.length;
    return [
      toolbar(ctx, {
        title: "Chat addresses",
        primary: {
          label: pending ? `Apply ${plural(pending, "change", "changes")}` : "Apply",
          disabled: !pending,
          onClick: () => (onFixes ? applyFixes(ctx) : applyStaged(ctx)),
        },
      }),
      h("div", { class: "view-tabs" },
        h("button", { class: onFixes ? "" : "active", onClick: () => {
          ctx.state.chatTab = "phones";
          ctx.render();
        } }, "Phone contacts"),
        h("button", { class: onFixes ? "active" : "", onClick: () => {
          ctx.state.chatTab = "fixes";
          ctx.render();
        } }, `Fix chat addresses${ctx.derived.prefix.length ? ` (${ctx.derived.prefix.length})` : ""}`)),
      onFixes ? fixesTab(ctx) : phonesTab(ctx),
    ];
  },

  detail(ctx) {
    const helpBox = help("What these mean", CHAT_HELP);
    if (ctx.state.chatTab === "fixes") {
      const p = ctx.derived.prefix.find((x) => x.card.id === ctx.state.selected);
      return [
        p ? cardSummary(p.card) : h("h3", {}, "Fix chat addresses"),
        h("p", {}, "Chat addresses saved by other apps sometimes lack the xmpp: in front, or sit in an older X-JABBER field that Thunderbird doesn't show. Thunderbird's card editor marks those red and won't save the card."),
        h("p", {}, "The fix writes them as xmpp: chat addresses. An X-JABBER field stays as it is, for the apps that read it."),
        helpBox,
      ];
    }
    const item = ctx.derived.chat.find((x) => x.card.id === ctx.state.selected);
    if (!item) {
      return [
        h("h3", {}, "Chat addresses"),
        h("p", {}, "Check the phone contacts who should get a JMP.chat address, or Select all phone contacts, then Apply. A checked contact already has a chat address."),
        h("p", {}, "To text someone who isn't in your chat list yet: search for them, select them, then Generate JMP.chat address."),
        helpBox,
        h("div", { class: "detail-actions" }, h("button", { onClick: () => openLink(LINKS.jmp) }, "About JMP.chat")),
      ];
    }
    const gateway = gatewayOf(ctx);
    const e164 = numberFor(ctx, item);
    return [
      cardSummary(item.card),
      item.state === "none" || (item.state === "theirs" && item.choices.length)
        ? [
          item.choices.length > 1
            ? [h("h4", {}, "Number"), item.choices.map((choice) => h("label", { class: "choice" },
              h("input", {
                type: "radio",
                name: "chat-number",
                checked: choice.e164 === e164,
                onChange: () => {
                  ctx.state.chatNumber.set(item.card.id, choice.e164);
                  ctx.render();
                },
              }),
              choice.value, choice.mobile ? tag("mobile", "plain") : null))]
            : null,
          h("h4", {}, "JMP.chat address"),
          h("p", {}, `xmpp:${jmpAddress(e164, gateway)}`),
          item.state === "theirs" ? h("p", {}, `This card already has ${item.addresses.join(", ")}. Add a JMP.chat address only if you also want to text this person's phone number.`) : null,
          h("div", { class: "detail-actions" },
            h("button", { class: "primary", disabled: Boolean(ctx.state.busy), onClick: () => generateOne(ctx, item) }, "Generate JMP.chat address")),
        ]
        : null,
      item.state === "ours"
        ? h("div", { class: "detail-actions" }, h("button", { class: "danger", disabled: Boolean(ctx.state.busy), onClick: () => removeOne(ctx, item) }, "Remove the JMP.chat address"))
        : null,
      item.state === "no-phone" ? h("p", {}, "None of this card's numbers has a country code, so there's no JMP.chat address to make. Phone numbers can add one.") : null,
      helpBox,
    ];
  },
};
