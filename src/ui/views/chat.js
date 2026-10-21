/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Chat: Thunderbird's chat list, seen from the address book. Only OMEMO
 * for Thunderbird can reach Thunderbird's chat, so the list comes from it
 * (cross-add-on messaging, src/lib/omemo.js); this page does the address
 * book side:
 *   - chat contacts the address book can't name, each with Add to a card
 *     and New card (the "Who is this?" page), so OMEMO names them;
 *   - the setting that names chat contacts, and the ones it named;
 *   - cards that aren't in the chat list yet, with Add to chat (OMEMO Pro
 *     0.3.3 and later puts them on the account's contact list).
 * Without OMEMO for Thunderbird, the page says what it would do and where
 * to get it.
 */

import { h, plural } from "../dom.js";
import { toolbar, row, avatar, cardSummary, change, help, tag, pendingBar, selectAll, matches } from "../parts.js";
import { openEditor } from "../card-editor.js";
import { label } from "../../core/card.js";
import { normalizeGateway, DEFAULT_GATEWAY } from "../../core/chat.js";
import { linkFor, linkToCard, newCardFor, notInChat } from "../../core/chat-list.js";
import { MODES, namesRow, omemoTier, STATUS_ORDER } from "../../lib/omemo.js";
import { LINKS, openLink } from "../../lib/links.js";

export const CHAT_HELP = [
  ["Chat list", "The people in Thunderbird's chat (Chat > Contacts) for one XMPP account. It's the contact list your XMPP server keeps for that account, so your other chat apps on it have the same list."],
  ["Names from your address book", "A chat contact shows its address, like +15551234567@cheogram.com, until it has a name. OMEMO for Thunderbird gives it the name of the card with that phone number (for a JMP.chat or Quicksy address) or that chat address. A name a chat contact already has is kept."],
  ["In Thunderbird only, or also on the server", "Thunderbird only: the names show in Thunderbird's chat list, nowhere else. Also on the server: they're saved in your account's contact list, so your other chat apps (Cheogram, Conversations) show them too."],
  ["Add to chat (OMEMO Pro)", "Puts a person from your address book on your chat list, so you can text and call them from Thunderbird: their chat address, or their phone number through JMP.chat (texts and calls to a phone number, for an XMPP account registered with JMP.chat)."],
];

const message = (e) => e?.message ?? String(e);
const gatewayOf = (ctx) => normalizeGateway(ctx.state.settings.gateway) ?? DEFAULT_GATEWAY;

/** A chat address as people read it: a JMP.chat or Quicksy address as its number. */
const shown = (jid) => {
  const link = linkFor(jid);
  return link.kind === "phone" ? link.text : jid;
};

/** Whether a chat contact matches the search box: its address or number. */
function jidMatches(jid, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) {
    return true;
  }
  const digits = q.replace(/\D/g, "");
  return jid.toLowerCase().includes(q) || (digits.length >= 3 && jid.replace(/\D/g, "").includes(digits));
}

let refreshTimer = null;

/** Asks OMEMO for Thunderbird whether it's there, for the chat list, and (Pro) whether it adds contacts. */
async function refresh(ctx) {
  const omemo = ctx.state.omemo;
  omemo.loading = true;
  omemo.error = null;
  ctx.render();
  const status = await ctx.omemo.status();
  omemo.status = status;
  omemo.result = null;
  omemo.canAdd = false;
  if (status.installed) {
    try {
      omemo.result = await ctx.omemo.preview();
    } catch (e) {
      omemo.error = message(e);
    }
    omemo.canAdd = omemoTier(status) === "pro" && await ctx.omemo.canAddContacts();
  }
  omemo.loading = false;
  ctx.render();
}

/** Asks again in a moment: OMEMO names chat contacts 3 seconds after a card changes, and a new chat contact arrives from the server. */
function refreshSoon(ctx, wait = 4000) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (ctx.state.view === "chat" && !ctx.state.omemo.loading && ctx.state.omemo.status?.installed) {
      refresh(ctx);
    }
  }, wait);
}

async function setMode(ctx, jid, mode) {
  const omemo = ctx.state.omemo;
  omemo.loading = true;
  ctx.render();
  try {
    omemo.result = await ctx.omemo.setMode(jid, mode);
    omemo.error = null;
  } catch (e) {
    omemo.error = message(e);
  }
  omemo.loading = false;
  ctx.render();
}

/** The account shown: the one picked, else the first. */
function currentAccount(ctx) {
  const accounts = ctx.state.omemo.result?.accounts ?? [];
  return accounts.find((a) => a.jid === ctx.state.chat.account) ?? accounts[0] ?? null;
}

const unnamedOf = (account) => account.contacts.filter((c) => c.status === "unmatched" || c.status === "ambiguous");
const pendingOf = (account) => account.contacts.filter((c) => (c.status === "set" || c.status === "update") && !c.done);

/* ---------- Who is this? (Add to a card, New card) ---------- */

/** Opens "Who is this?" for a chat contact, with the cursor in the name box or the search box. */
function openPick(ctx, jid, focus = "pick-name") {
  ctx.state.chat.pick = { jid, name: "", search: "" };
  ctx.state.selected = null;
  ctx.render();
  document.getElementById(focus)?.focus();
}

function closePick(ctx) {
  ctx.state.chat.pick = null;
  ctx.render();
}

const writableBooks = (ctx) => {
  const excluded = new Set(ctx.state.settings.excludedBooks);
  return ctx.state.books.filter((b) => !b.readOnly && !b.remote && !excluded.has(b.id));
};

async function createCard(ctx, jid, name, bookId) {
  const entry = await ctx.apply(`New card: ${name}`, [{ type: "create", parentId: bookId, vCard: newCardFor(jid, name), label: name }]);
  if (entry) {
    ctx.state.chat.pick = null;
    await ctx.saveSettings({ newCardBook: bookId });
    refreshSoon(ctx);
  }
}

async function addToCard(ctx, jid, card) {
  const vCard = linkToCard(card.vCard, jid);
  if (vCard === card.vCard) {
    ctx.toast(`${label(card)} has ${shown(jid)} already.`);
    return;
  }
  const entry = await ctx.apply(`Added ${shown(jid)} to ${label(card)}`, [{ type: "update", id: card.id, vCard, label: label(card) }]);
  if (entry) {
    ctx.state.chat.pick = null;
    ctx.render();
    refreshSoon(ctx);
  }
}

function pickPage(ctx) {
  const pick = ctx.state.chat.pick;
  const link = linkFor(pick.jid);
  const account = currentAccount(ctx);
  const books = writableBooks(ctx);
  const bookId = books.some((b) => b.id === pick.book) ? pick.book
    : books.some((b) => b.id === ctx.state.settings.newCardBook) ? ctx.state.settings.newCardBook : books[0]?.id;
  const found = ctx.state.cards.filter((c) => matches(c, pick.search));
  const shownCards = found.slice(0, 50);
  const what = link.kind === "phone" ? "this number" : "this chat address";
  const create = () => {
    if (pick.name.trim() && bookId) {
      createCard(ctx, pick.jid, pick.name.trim(), bookId);
    }
  };
  return [
    h("div", { class: "toolbar" },
      h("button", { onClick: () => closePick(ctx) }, "‹ Back"),
      h("h2", { style: { flex: "1" } }, `Who is ${shown(pick.jid)}?`)),
    h("div", { class: "page", "data-scroll": "pick" },
      h("p", {}, link.kind === "phone"
        ? `Thunderbird's chat list shows ${pick.jid} because no card has the number ${link.text}. Make a card for this person, or add the number to their card (as a mobile number). The chat list then shows their name.`
        : `Thunderbird's chat list shows ${pick.jid} because no card has this chat address. Make a card for this person, or add the address to their card. The chat list then shows their name.`),
      account && account.mode === "off"
        ? h("div", { class: "notice warn" }, `Names are off for ${account.jid}. To see the name in Thunderbird, set "Names from your address book" on the Chat page.`)
        : null,

      h("div", { class: "page-section" },
        h("div", { class: "label" }, "New card"),
        h("div", { class: "pick-new" },
          h("input", { type: "text", id: "pick-name", value: pick.name, placeholder: "Their name", "aria-label": "Name", onInput: (e) => {
            pick.name = e.target.value;
            const button = document.getElementById("pick-create");
            if (button) {
              button.disabled = !pick.name.trim() || !bookId || Boolean(ctx.state.busy);
            }
          }, onKeydown: (e) => {
            if (e.key === "Enter") {
              create();
            }
          } }),
          books.length > 1
            ? h("select", { "aria-label": "Address book", onChange: (e) => {
              pick.book = e.target.value;
            } }, books.map((b) => h("option", { value: b.id, selected: b.id === bookId }, b.name)))
            : null,
          h("button", { class: "primary", id: "pick-create", disabled: !pick.name.trim() || !bookId || Boolean(ctx.state.busy), onClick: create }, "Create card")),
        h("p", { class: "hint" }, `The card gets the name and ${link.kind === "phone" ? `the mobile number ${link.text}` : `the chat address xmpp:${link.address}`}. Undo removes it again.`)),

      h("div", { class: "page-section" },
        h("div", { class: "label" }, "Or add it to a card you have"),
        h("input", { type: "search", id: "pick-search", class: "search-box", style: { maxWidth: "480px" }, value: pick.search, placeholder: "Search names, numbers, addresses", onInput: (e) => {
          pick.search = e.target.value;
          ctx.render();
        } }),
        h("div", { class: "chat-list" },
          shownCards.map((card) => row(ctx, {
            key: `pick:${card.id}`,
            lead: avatar(card),
            title: label(card),
            meta: [
              card.phones[0] ? h("span", {}, card.phones[0].value) : null,
              card.emails[0] ? h("span", {}, card.emails[0].address) : null,
              h("span", {}, card.bookName),
            ],
            actions: [h("button", { class: "small", disabled: Boolean(ctx.state.busy), onClick: () => addToCard(ctx, pick.jid, card) }, `Add ${what}`)],
          })),
          found.length > shownCards.length ? h("p", { class: "hint", style: { padding: "8px 16px" } }, `${found.length - shownCards.length} more: search to narrow it down.`) : null,
          found.length === 0 ? h("p", { class: "hint", style: { padding: "8px 16px" } }, "No card matches.") : null))),
  ];
}

/* ---------- The Chat page ---------- */

function notInstalled(ctx) {
  return [
    h("p", {}, "Thunderbird's chat list shows a contact's address, like +15551234567@cheogram.com, until it has a name. With OMEMO for Thunderbird (free), this page names your XMPP chat contacts from your address book, and lets you put the ones it can't name on a card. It also encrypts your chats end to end with OMEMO, the encryption Conversations, Cheogram, Monal and Gajim use."),
    h("p", {}, "It isn't on addons.thunderbird.net: it needs access to Thunderbird's chat, which add-ons listed there can't have. It's free and open source (MPL-2.0), installed from its own page."),
    h("div", { class: "detail-actions", style: { maxWidth: "460px" } },
      h("button", { class: "primary", onClick: () => openLink(LINKS.omemo) }, "Get OMEMO for Thunderbird"),
      h("button", { onClick: () => refresh(ctx) }, "Check again")),
    h("div", { class: "notice" }, "Installed already? Contacts Cleanup needs OMEMO for Thunderbird 0.1.5 or later, turned on in Add-ons and Themes."),
  ];
}

function accountBox(ctx, account) {
  const pending = pendingOf(account);
  const what = MODES.find(([value]) => value === account.mode)?.[2] ?? "";
  return h("div", { class: "account-card" },
    h("div", { class: "row-line" },
      h("span", { class: "jid" }, account.jid),
      h("label", { class: "choice" }, "Names from your address book",
        h("select", {
          id: "names-mode",
          disabled: ctx.state.omemo.loading,
          onChange: (e) => setMode(ctx, account.jid, e.target.value),
        }, MODES.map(([value, text]) => h("option", { value, selected: account.mode === value }, text))))),
    h("p", { class: "summary" }, what),
    pending.length
      ? h("div", { class: "account-actions" },
        h("span", { class: "summary", style: { margin: "0", alignSelf: "center" } }, account.mode === "off"
          ? `${plural(pending.length, "chat contact would get its name", "chat contacts would get their names")} with names on.`
          : `${plural(pending.length, "chat contact is", "chat contacts are")} waiting for ${pending.length === 1 ? "its name" : "their names"}.`),
        account.mode !== "off"
          ? h("button", { class: "primary small", disabled: ctx.state.omemo.loading, onClick: () => setMode(ctx, account.jid, account.mode) }, pending.length === 1 ? "Name it now" : `Name all ${pending.length} now`)
          : null)
      : null);
}

function unnamedSection(ctx, account) {
  const rows = unnamedOf(account).filter((c) => jidMatches(c.jid, ctx.state.search)).sort((a, b) => a.jid.localeCompare(b.jid));
  return [
    h("div", { class: "list-heading" }, `Not named: ${rows.length}`),
    rows.length === 0
      ? h("p", { class: "hint" }, ctx.state.search ? "None match the search." : "Every chat contact on this account is in your address book.")
      : [
        h("p", { class: "hint" }, "These chat contacts aren't in your address book, so they show as an address. Add each one to the person's card, or make a new card."),
        h("div", { class: "chat-list" }, rows.map((c) => row(ctx, {
          key: `jid:${c.jid}`,
          lead: h("div", { class: "avatar", style: { background: "var(--border-alt)" }, "aria-hidden": "true" }, "?"),
          title: shown(c.jid),
          meta: [
            shown(c.jid) !== c.jid ? h("span", {}, c.jid) : null,
            c.status === "ambiguous"
              ? h("span", {}, `cards with different names: ${(c.names ?? []).join(", ")}`)
              : h("span", {}, "not in your address book"),
          ],
          actions: c.status === "ambiguous"
            ? [h("button", { class: "small", title: "Cards with different names have this number or address. Merge them, or take it off the wrong card.", onClick: () => {
              ctx.state.search = linkFor(c.jid).kind === "phone" ? linkFor(c.jid).e164 : c.jid;
              ctx.setView("duplicates");
            } }, "Show the cards")]
            : [
              h("button", { class: "small primary", disabled: Boolean(ctx.state.busy), onClick: () => openPick(ctx, c.jid, "pick-search") }, "Add to a card"),
              h("button", { class: "small", disabled: Boolean(ctx.state.busy), onClick: () => openPick(ctx, c.jid) }, "New card"),
            ],
        }))),
      ],
  ];
}

function namedSection(ctx, account) {
  const rows = account.contacts
    .filter((c) => c.status !== "unmatched" && c.status !== "ambiguous" && jidMatches(c.jid, ctx.state.search))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.jid.localeCompare(b.jid));
  if (!rows.length) {
    return null;
  }
  return h("details", { class: "chat-details", open: Boolean(ctx.state.search) || ctx.state.chat.namedOpen, onToggle: (e) => {
    ctx.state.chat.namedOpen = e.target.open;
  } },
  h("summary", { class: "list-heading" }, `In your address book: ${rows.length}`),
  h("div", { class: "chat-list" }, rows.map((c) => row(ctx, {
    key: `jid:${c.jid}`,
    title: shown(c.jid),
    meta: [shown(c.jid) !== c.jid ? h("span", {}, c.jid) : null, h("span", {}, namesRow(c, account.mode))],
  }))));
}

/** The cards not in the chat list, for Add to chat. */
function addable(ctx, account) {
  return notInChat(ctx.state.cards, account.contacts.map((c) => c.jid), gatewayOf(ctx)).filter((item) => matches(item.card, ctx.state.search));
}

async function addToChat(ctx, account, items) {
  const n = items.length;
  const go = await ctx.confirm({
    title: `Add ${plural(n, "person", "people")} to your chat list?`,
    body: [
      h("p", {}, `${n === 1 ? `${label(items[0].card)} goes` : `They go`} on the contact list of ${account.jid} on your XMPP server, with the ${n === 1 ? "name from the card" : "names from their cards"}. ${n === 1 ? "It shows" : "They show"} in Thunderbird's chat list and in your other chat apps on that account.`),
      h("p", {}, "Each one is asked to share their online status. JMP.chat numbers say yes by themselves."),
      h("p", {}, "To take one off later: right-click it in Thunderbird's chat list, then Delete."),
    ],
    ok: n === 1 ? "Add to chat" : `Add ${n} to chat`,
  });
  if (!go) {
    return;
  }
  ctx.state.busy = { text: "Adding to chat…" };
  ctx.render();
  let result;
  try {
    result = await ctx.omemo.addContacts(account.jid, items.map((item) => ({ jid: item.jid, name: label(item.card) })));
  } catch (e) {
    result = { added: [], failed: items.map((item) => ({ jid: item.jid, error: message(e) })) };
  }
  ctx.state.busy = null;
  const added = result?.added?.length ?? 0;
  const failed = result?.failed ?? [];
  for (const item of items) {
    ctx.state.chat.addSel.delete(item.card.id);
  }
  ctx.render();
  ctx.toast(failed.length
    ? `Added ${added} to chat. ${plural(failed.length, "couldn't be added", "couldn't be added")}: ${failed.map((f) => `${f.jid} (${f.error})`).join(", ")}`
    : `Added ${plural(added, "person", "people")} to chat on ${account.jid}.`, { error: failed.length > 0 });
  refreshSoon(ctx, 2000);
}

function addSection(ctx, account) {
  const tier = omemoTier(ctx.state.omemo.status);
  const items = addable(ctx, account);
  const canAdd = tier === "pro" && ctx.state.omemo.canAdd;
  const sel = ctx.state.chat.addSel;
  const heading = h("div", { class: "list-heading" }, `Not in your chat list yet: ${items.length}`);
  if (!items.length) {
    return [heading, h("p", { class: "hint" }, ctx.state.search ? "None match the search." : "Everyone in your address book with a phone number or chat address is in your chat list.")];
  }
  const rowFor = (item) => row(ctx, {
    key: item.card.id,
    check: canAdd ? {
      checked: sel.has(item.card.id),
      title: "Add to chat",
      onChange: (value) => {
        sel[value ? "add" : "delete"](item.card.id);
        ctx.render();
      },
    } : null,
    lead: avatar(item.card),
    title: label(item.card),
    meta: item.via === "phone" ? [change(item.number, item.jid, false), tag("JMP.chat", "plain")] : [h("span", {}, item.jid)],
  });
  if (!canAdd) {
    return [
      heading,
      tier === "pro"
        ? h("div", { class: "notice" }, "Your OMEMO Pro is older than 0.3.3, the version that adds people to your chat list. Update it: Add-ons and Themes > gear > Check for Updates.")
        : h("div", { class: "notice pitch" },
          h("span", {}, "Text and call these people from Thunderbird: OMEMO Pro for Thunderbird adds them to your chat list (their chat address, or their number through JMP.chat), and adds audio calls. $10, one time."),
          h("button", { class: "primary small", onClick: () => openLink(LINKS.omemoPro) }, "Get OMEMO Pro")),
      h("div", { class: "chat-list" }, items.slice(0, 5).map(rowFor)),
      items.length > 5 ? h("p", { class: "hint" }, `and ${items.length - 5} more.`) : null,
    ];
  }
  return [
    heading,
    h("div", { class: "toolbar-filters chat-filters" },
      h("label", {}, "JMP.chat gateway",
        h("input", {
          type: "text",
          id: "gateway",
          class: normalizeGateway(ctx.state.settings.gateway) ? "" : "invalid",
          style: { width: "130px" },
          value: ctx.state.settings.gateway,
          title: "JMP.chat's gateway is cheogram.com. Another Cheogram gateway's domain can go here.",
          onChange: (e) => ctx.saveSettings({ gateway: e.target.value.trim() || DEFAULT_GATEWAY }),
        })),
      h("span", { class: "right" }, selectAll("Select all", items.map((item) => sel.has(item.card.id)), (value) => {
        for (const item of items) {
          sel[value ? "add" : "delete"](item.card.id);
        }
        ctx.render();
      }))),
    h("div", { class: "chat-list" }, items.map(rowFor)),
  ];
}

export default {
  id: "chat",
  title: "Chat",
  dot: "#20a39e",

  // The chat contacts that need a card.
  count: (ctx) => {
    const account = currentAccount(ctx);
    return account ? unnamedOf(account).length : null;
  },

  // Asks afresh each time the page is shown, so it never shows an old answer.
  onShow(ctx) {
    if (!ctx.state.omemo.loading) {
      refresh(ctx);
    }
  },

  onCardsChanged(ctx) {
    refreshSoon(ctx);
  },

  main(ctx) {
    if (ctx.state.chat.pick) {
      return pickPage(ctx);
    }
    const omemo = ctx.state.omemo;
    const tier = omemoTier(omemo.status);
    const accounts = omemo.result?.accounts ?? [];
    const account = currentAccount(ctx);
    let body;
    if (!omemo.status || (omemo.loading && !omemo.result && tier !== "none")) {
      body = h("p", {}, "Asking OMEMO for Thunderbird…");
    } else if (tier === "none") {
      body = notInstalled(ctx);
    } else if (!account) {
      body = h("div", { class: "notice" }, omemo.error
        ? `OMEMO for Thunderbird answered with an error: ${omemo.error}`
        : "No XMPP account is connected right now. Connect one in Thunderbird's chat, then Refresh.");
    } else {
      body = [
        accountBox(ctx, account),
        omemo.error ? h("div", { class: "notice warn" }, `OMEMO for Thunderbird answered with an error: ${omemo.error}`) : null,
        unnamedSection(ctx, account),
        addSection(ctx, account),
        namedSection(ctx, account),
      ];
    }
    const selected = account && tier === "pro" && omemo.canAdd ? addable(ctx, account).filter((item) => ctx.state.chat.addSel.has(item.card.id)) : [];
    return [
      toolbar(ctx, {
        title: "Chat",
        search: tier !== "none",
        extra: [
          accounts.length > 1
            ? h("select", { "aria-label": "Chat account", onChange: (e) => {
              ctx.state.chat.account = e.target.value;
              ctx.state.chat.addSel.clear();
              ctx.render();
            } }, accounts.map((a) => h("option", { value: a.jid, selected: a.jid === account?.jid }, a.jid)))
            : null,
          tier !== "none" ? h("button", { onClick: () => ctx.omemo.openOptions("contacts").catch(() => {}) }, "OMEMO settings") : null,
          h("button", { disabled: omemo.loading, onClick: () => refresh(ctx) }, omemo.loading ? "Checking…" : "Refresh"),
        ],
      }),
      h("div", { class: "page", "data-scroll": "page" }, body),
      selected.length
        ? pendingBar(ctx, {
          text: `${plural(selected.length, "person is", "people are")} checked for your chat list.`,
          applyLabel: selected.length === 1 ? "Add to chat" : `Add ${selected.length} to chat`,
          onApply: () => addToChat(ctx, account, selected),
          onClear: () => {
            ctx.state.chat.addSel.clear();
            ctx.render();
          },
        })
        : null,
    ];
  },

  detail(ctx) {
    const tier = omemoTier(ctx.state.omemo.status);
    const account = currentAccount(ctx);
    const helpBox = help("What these mean", CHAT_HELP);
    const proPitch = tier === "free"
      ? [
        h("h4", {}, "OMEMO Pro for Thunderbird"),
        h("p", {}, "Adds people from your address book to your chat list, and audio calls with JMP.chat phone numbers, Cheogram and other XMPP apps. $10, one time."),
        h("div", { class: "detail-actions" }, h("button", { onClick: () => openLink(LINKS.omemoPro) }, "Get OMEMO Pro")),
      ]
      : null;
    if (ctx.state.chat.pick) {
      return [
        h("h3", {}, "Who is this?"),
        h("p", {}, "Type a name and Create card, or find the person's card and add the number (or chat address) to it."),
        h("p", {}, "Once a card has it, OMEMO for Thunderbird gives the chat contact that card's name within a few seconds (when names are on for the account)."),
        h("p", {}, "Undo (the message after, or Changes) takes it back."),
      ];
    }
    const selected = String(ctx.state.selected ?? "");
    if (account && selected.startsWith("jid:")) {
      const contact = account.contacts.find((c) => `jid:${c.jid}` === selected);
      if (contact) {
        const unnamed = contact.status === "unmatched";
        return [
          h("h3", {}, shown(contact.jid)),
          h("p", {}, contact.jid),
          h("p", {}, namesRow(contact, account.mode)),
          unnamed
            ? h("div", { class: "detail-actions" },
              h("button", { class: "primary", onClick: () => openPick(ctx, contact.jid, "pick-search") }, "Add to a card"),
              h("button", { onClick: () => openPick(ctx, contact.jid) }, "New card"))
            : null,
          helpBox,
        ];
      }
    }
    const item = account ? addable(ctx, account).find((x) => x.card.id === selected) : null;
    if (item) {
      return [
        cardSummary(item.card, () => openEditor(ctx, item.card.id)),
        h("h4", {}, "Not in your chat list yet"),
        h("p", {}, item.via === "phone" ? `Through JMP.chat: ${item.jid}` : `Chat address: ${item.jid}`),
        tier === "pro" && ctx.state.omemo.canAdd
          ? h("div", { class: "detail-actions" }, h("button", { class: "primary", disabled: Boolean(ctx.state.busy), onClick: () => addToChat(ctx, account, [item]) }, "Add to chat"))
          : null,
        proPitch,
      ];
    }
    return [
      h("h3", {}, "Chat"),
      h("p", {}, "Your XMPP chat list next to your address book:"),
      h("ul", {},
        h("li", {}, "Not named: chat contacts no card has. Add each to the person's card, or make a card, and it gets the name."),
        h("li", {}, "Not in your chat list yet: people with a phone number or chat address you can't chat with yet. Add to chat puts them on your chat list (OMEMO Pro)."),
        h("li", {}, "In your address book: chat contacts named from their cards.")),
      helpBox,
      proPitch,
    ];
  },
};
