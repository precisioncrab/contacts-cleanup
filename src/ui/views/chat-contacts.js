/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Chat contacts: names for Thunderbird's XMPP chat contacts from the
 * address book, run by OMEMO for Thunderbird (it can reach Thunderbird's
 * chat; this add-on can't). Without it, the page says what it would do
 * and where to get it.
 */

import { h, plural } from "../dom.js";
import { toolbar, help } from "../parts.js";
import { MODES, namesSummary, namesRow, STATUS_ORDER } from "../../lib/omemo.js";
import { LINKS, openLink } from "../../lib/links.js";

export const CHAT_CONTACTS_HELP = [
  ["Chat contact", "Someone in Thunderbird's chat list (Chat > Contacts). It shows their name if it has one, else their address. Thunderbird's list holds the contact list your XMPP server keeps for your account."],
  ["Names in Thunderbird only", "The name from the address book shows in Thunderbird's chat list. Your XMPP server and your other chat apps don't get it."],
  ["Names in Thunderbird and on the server", "The name is saved in your account's contact list on your XMPP server, so every chat app signed in to that account shows it too."],
  ["Which card names a chat contact", "A JMP.chat or Quicksy address (a phone number) matches the cards' phone numbers in any format; other addresses match the cards' chat addresses, then their email addresses. Cards with different names for one contact give no name. A name a chat contact already has is kept."],
  ["Removing a chat contact", "In Thunderbird's chat list, it only leaves Thunderbird. On the server, it leaves your account's contact list for every chat app. The card and its chat address stay."],
];

async function refresh(ctx) {
  const omemo = ctx.state.omemo;
  omemo.loading = true;
  omemo.error = null;
  ctx.render();
  const status = await ctx.omemo.status();
  omemo.status = status;
  omemo.result = null;
  if (status.installed) {
    try {
      omemo.result = await ctx.omemo.preview();
    } catch (e) {
      omemo.error = e?.message ?? String(e);
    }
  }
  omemo.loading = false;
  ctx.render();
}

async function setMode(ctx, jid, mode) {
  const omemo = ctx.state.omemo;
  omemo.loading = true;
  ctx.render();
  try {
    omemo.result = await ctx.omemo.setMode(jid, mode);
    omemo.error = null;
  } catch (e) {
    omemo.error = e?.message ?? String(e);
  }
  omemo.loading = false;
  ctx.render();
}

function notInstalled(ctx) {
  return [
    h("p", {}, "Thunderbird's chat list shows a contact's address when it has no name, which is most JMP.chat and Cheogram contacts (their names live in your phone's address book). OMEMO for Thunderbird gives your XMPP chat contacts the names from this address book, and encrypts your chats end to end with OMEMO, the encryption Conversations, Cheogram, Monal and Gajim use."),
    h("p", {}, "It isn't on addons.thunderbird.net: it needs access to Thunderbird's chat, which add-ons listed there can't have. It's free and open source (MPL-2.0), installed from its own page."),
    h("div", { class: "detail-actions", style: { maxWidth: "460px" } },
      h("button", { class: "primary", onClick: () => openLink(LINKS.omemoInstall) }, "Get OMEMO for Thunderbird"),
      h("button", { onClick: () => refresh(ctx) }, "Check again")),
    h("div", { class: "notice" }, "Installed already? Contacts Cleanup needs OMEMO for Thunderbird 0.1.5 or later, turned on in Add-ons and Themes."),
  ];
}

function accounts(ctx) {
  const { result, status } = ctx.state.omemo;
  const info = status.info ?? {};
  const out = [
    h("p", {}, `${info.name ?? "OMEMO for Thunderbird"}${info.version ? ` ${info.version}` : ""} is installed. Pick, per account, where chat contacts get their names from this address book. Off shows what would happen without changing anything.`),
  ];
  if (!result) {
    return out;
  }
  if (!result.accounts?.length) {
    out.push(h("div", { class: "notice" }, "No XMPP account is connected right now. Connect one in Thunderbird's chat, then Refresh."));
    return out;
  }
  if (!result.cards) {
    out.push(h("div", { class: "notice warn" }, "No address book card with a name was found. Cards need a name and a phone number, chat address or email address."));
  }
  for (const account of result.accounts) {
    const sorted = [...account.contacts].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.jid.localeCompare(b.jid));
    out.push(h("div", { class: "account-card" },
      h("div", { class: "row-line" },
        h("span", { class: "jid" }, account.jid),
        h("label", { class: "choice" }, "Names",
          h("select", {
            disabled: ctx.state.omemo.loading,
            onChange: (e) => setMode(ctx, account.jid, e.target.value),
          }, MODES.map(([value, text]) => h("option", { value, selected: account.mode === value }, text))))),
      h("p", { class: "summary" }, namesSummary(account)),
      account.contacts.length
        ? h("details", {},
          h("summary", {}, `All ${plural(account.contacts.length, "chat contact", "chat contacts")}`),
          h("table", {}, sorted.map((contact) => h("tr", {}, h("th", {}, contact.jid), h("td", {}, namesRow(contact, account.mode))))))
        : null));
  }
  out.push(h("div", { class: "notice" },
    "Chat contacts that aren't in the address book can't get a name. Phone numbers in one format, missing names and chat addresses on cards (the other pages here) help more of them match."));
  return out;
}

export default {
  id: "chatContacts",
  title: "Chat contacts",
  dot: "#20a39e",

  count: () => null,

  onShow(ctx) {
    if (!ctx.state.omemo.status && !ctx.state.omemo.loading) {
      refresh(ctx);
    }
  },

  main(ctx) {
    const omemo = ctx.state.omemo;
    let body;
    if (!omemo.status) {
      body = h("p", {}, "Asking OMEMO for Thunderbird…");
    } else if (!omemo.status.installed) {
      body = notInstalled(ctx);
    } else {
      body = [
        accounts(ctx),
        omemo.error ? h("div", { class: "notice warn" }, `OMEMO for Thunderbird answered with an error: ${omemo.error}`) : null,
      ];
    }
    return [
      toolbar(ctx, {
        title: "Chat contacts",
        search: false,
        extra: [
          omemo.status?.installed ? h("button", { onClick: () => ctx.omemo.openOptions("contacts").catch(() => {}) }, "OMEMO settings") : null,
          h("button", { disabled: omemo.loading, onClick: () => refresh(ctx) }, omemo.loading ? "Checking…" : "Refresh"),
        ],
      }),
      h("div", { class: "page", "data-scroll": "page" }, body),
    ];
  },

  detail() {
    return [
      h("h3", {}, "Chat contacts"),
      h("p", {}, "Contacts Cleanup works on the address book. Thunderbird's chat list is reached only by OMEMO for Thunderbird, so this page asks it to do the naming, with the same results as its own options page."),
      help("What these mean", CHAT_CONTACTS_HELP),
      h("h4", {}, "OMEMO Pro for Thunderbird"),
      h("p", {}, "Audio calls with JMP.chat, Cheogram and other XMPP apps, in a call window in Thunderbird."),
      h("div", { class: "detail-actions" }, h("button", { onClick: () => openLink(LINKS.omemoPro) }, "Learn about OMEMO Pro")),
    ];
  },
};
