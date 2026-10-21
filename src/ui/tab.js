/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The Contacts Cleanup tab: reads the address books, works out the
 * proposals (src/core/), shows them in views (src/ui/views/), and applies
 * what the user kept, recording each change for undo.
 *
 * Stored in storage.local:
 *   settings   { theme, excludedBooks, phoneStyle, country, gateway }
 *   dismissed  duplicate pairs marked "Not duplicates"
 *   generated  { <card id>: [chat addresses this add-on wrote] }
 *   history    applied changes, newest first (src/core/history.js)
 */

import { h, fill, plural } from "./dom.js";
import { onPhotosLoaded } from "./parts.js";
import { menuBar } from "./menu.js";
import { THEMES, applyTheme, getThemePref, initTheme } from "./theme.js";
import { loadBooks, api, onAddressBookChange, reachableBook, splitKey } from "../lib/addressbook.js";
import { omemoClient, omemoTier } from "../lib/omemo.js";
import { LINKS, openLink } from "../lib/links.js";
import { readCard, label } from "../core/card.js";
import { findDuplicates, suggestPeople } from "../core/duplicates.js";
import { phoneFixes, proposeName } from "../core/fixes.js";
import { prefixFixes, DEFAULT_GATEWAY } from "../core/chat.js";
import { countryById } from "../core/phone.js";
import { applyChanges, undoEntry, addEntry } from "../core/history.js";
import contacts, { allLabels } from "./views/contacts.js";
import duplicates from "./views/duplicates.js";
import phones from "./views/phones.js";
import names from "./views/names.js";
import chat from "./views/chat.js";
import changesView from "./views/history.js";
import about from "./views/about.js";
import { refreshOmemo } from "./omemo-state.js";

const VIEWS = { contacts, duplicates, phones, names, chat, history: changesView, about };

// Pages that were renamed or merged, for old links.
const VIEW_ALIASES = { chatContacts: "chat", fixes: "chat", addresses: "chat" };

// `collapsed`: the sidebar categories folded away.
const DEFAULT_SETTINGS = { theme: "system", excludedBooks: [], phoneStyle: "international", country: "nanp", gateway: DEFAULT_GATEWAY, duplicatesAcrossBooks: false, newCardBook: null, collapsed: [] };

const state = {
  view: "contacts",
  loading: true,
  loadError: null,
  books: [],
  cards: [],
  settings: { ...DEFAULT_SETTINGS },
  dismissed: new Set(),
  generated: {},
  history: [],
  selected: null,
  search: "",
  busy: null,
  // Per view: what the user unchecked, edited or staged.
  phoneOff: new Set(),
  nameEdits: new Map(),
  nameOn: new Map(),
  prefixOff: new Set(),
  // Chat addresses: the tab ("contacts" or "list"), the account whose chat list is shown,
  // the "Who is this?" page ({ jid, name, search, book }), the contacts checked, the filter.
  chat: { tab: "contacts", account: null, pick: null, sel: new Set(), namedOpen: false, filter: "all" },
  merge: null,
  // The contact editor (contact-panel.js): edits per contact until saved, and a new contact being made.
  drafts: new Map(),
  newContact: null,
  // All contacts: the label shown (null for all).
  contactsFilter: null,
  omemo: { loading: false, status: null, result: null, error: null, canAdd: false },
};

const derived = { duplicates: [], phones: [], names: [], prefix: [] };

// Changes this tab makes fire address book events; the tab reloads once
// when it's done instead of after every card.
let applying = false;

const ctx = {
  state,
  derived,
  omemo: omemoClient(),
  render,
  select(key) {
    state.selected = key;
    state.newContact = null;
    render();
  },
  setView,
  saveSettings,
  dismiss,
  apply,
  undo,
  confirm: (options) => confirmDialog(options),
  toast: (text, options) => toast(text, options),
};

/* ---------- Data ---------- */

function recompute() {
  const s = state.settings;
  const country = countryById(s.country);
  // A copy Thunderbird doesn't let add-ons change (see markShadowed) is never proposed for a change.
  const cards = state.cards.filter((c) => !c.shadowed);
  derived.duplicates = findDuplicates(cards, state.dismissed, { acrossBooks: s.duplicatesAcrossBooks })
    .map((group) => ({ ...group, suggested: suggestPeople(group.cards, state.dismissed) }));
  derived.phones = cards
    .map((card) => ({ card, ...phoneFixes(card, { style: s.phoneStyle, country }) }))
    .filter((p) => p.fixes.length || p.skipped.length);
  derived.names = cards.map((card) => ({ card, proposal: proposeName(card) })).filter((n) => n.proposal);
  derived.prefix = cards.map((card) => ({ card, fixes: prefixFixes(card) })).filter((p) => p.fixes.length);
}

/**
 * The same contact can be in two address books with one UID (a book
 * imported from another). Thunderbird lets add-ons reach only one of those
 * copies, so the others are marked `shadowed` with the name of the book
 * whose copy Thunderbird changes: they're shown, but nothing is proposed
 * or saved for them (src/lib/addressbook.js refuses such a write too).
 */
async function markShadowed() {
  const byUid = new Map();
  for (const book of state.books.filter((b) => !b.readOnly && !b.remote)) {
    for (const contact of book.contacts) {
      byUid.set(contact.uid, [...(byUid.get(contact.uid) ?? []), contact.parentId]);
    }
  }
  const reachable = new Map();
  for (const [uid, books] of byUid) {
    if (books.length > 1) {
      reachable.set(uid, await reachableBook(uid));
    }
  }
  const bookName = (id) => state.books.find((b) => b.id === id)?.name ?? "another address book";
  for (const card of state.cards) {
    const target = reachable.get(card.uid);
    card.shadowed = target !== undefined && target !== card.parentId ? bookName(target) : null;
  }
  state.shadowedCount = state.cards.filter((c) => c.shadowed).length;
}

/** "Not duplicates" pairs saved by 0.1.16 and older name cards by UID only; they now name each copy. */
function upgradeDismissed() {
  const byUid = new Map();
  for (const card of state.cards) {
    byUid.set(card.uid, [...(byUid.get(card.uid) ?? []), card.id]);
  }
  for (const pair of [...state.dismissed]) {
    const [a, b] = pair.split("|");
    if (splitKey(a).book || splitKey(b).book) {
      continue;
    }
    for (const ka of byUid.get(a) ?? []) {
      for (const kb of byUid.get(b) ?? []) {
        state.dismissed.add(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`);
      }
    }
  }
}

async function reload() {
  try {
    state.books = await loadBooks();
    state.loadError = null;
  } catch (e) {
    state.books = [];
    state.loadError = e?.message ?? String(e);
  }
  // Leftover properties from Thunderbird's Manifest V3 contacts bug, in every writable book (src/lib/addressbook.js).
  const damaged = state.books.filter((b) => !b.readOnly && !b.remote).flatMap((b) => b.contacts).filter((c) => c.junk > 0);
  state.junk = { cards: damaged.length, fields: damaged.reduce((n, c) => n + c.junk, 0), ids: damaged.map((c) => c.id) };
  const excluded = new Set(state.settings.excludedBooks);
  state.cards = state.books
    .filter((book) => !book.readOnly && !book.remote && !excluded.has(book.id))
    .flatMap((book) => book.contacts.filter((node) => !node.readOnly).map((node) => ({ ...readCard(node, book.name), uid: node.uid })))
    .sort((a, b) => label(a).localeCompare(label(b)));
  await markShadowed();
  upgradeDismissed();
  const ids = new Set(state.cards.map((c) => c.id));
  for (const map of [state.nameEdits, state.nameOn, state.drafts]) {
    for (const id of map.keys()) {
      if (!ids.has(id)) {
        map.delete(id);
      }
    }
  }
  for (const id of state.chat.sel) {
    if (!ids.has(id)) {
      state.chat.sel.delete(id);
    }
  }
  if (state.merge && !state.merge.key.split("|").every((id) => ids.has(id))) {
    state.merge = null;
  }
  recompute();
  state.loading = false;
  render();
}

async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await browser.storage.local.set({ settings: state.settings });
  if ("excludedBooks" in patch) {
    await reload();
    return;
  }
  recompute();
  render();
}

async function dismiss(pairs) {
  for (const pair of pairs) {
    state.dismissed.add(pair);
  }
  await browser.storage.local.set({ dismissed: [...state.dismissed] });
  state.selected = null;
  recompute();
  render();
}

/** Records chat addresses written (+1) or taken off (-1) by this add-on. */
function trackGenerated(generated, direction) {
  const add = (id, address) => {
    state.generated[id] = [...new Set([...(state.generated[id] ?? []), address])];
  };
  const drop = (id, address) => {
    state.generated[id] = (state.generated[id] ?? []).filter((a) => a !== address);
    if (!state.generated[id].length) {
      delete state.generated[id];
    }
  };
  for (const [id, address] of generated.added ?? []) {
    (direction > 0 ? add : drop)(id, address);
  }
  for (const [id, address] of generated.removed ?? []) {
    (direction > 0 ? drop : add)(id, address);
  }
}

/**
 * Applies changes to cards (src/core/history.js), records them for undo,
 * and offers Undo. `extra.generated` is { added, removed } chat addresses.
 * Returns the history entry, or null when nothing was changed.
 */
async function apply(title, changes, extra = {}) {
  if (!changes.length || state.busy) {
    return null;
  }
  applying = true;
  state.busy = { done: 0, total: changes.length };
  render();
  const { entry, error } = await applyChanges(api, title, changes, (done, total) => {
    state.busy = { done, total };
    renderProgress();
  });
  if (entry.cards.length) {
    if (extra.generated) {
      const done = new Set(entry.cards.map((c) => c.id));
      entry.generated = {
        added: (extra.generated.added ?? []).filter(([id]) => done.has(id)),
        removed: (extra.generated.removed ?? []).filter(([id]) => done.has(id)),
      };
      trackGenerated(entry.generated, +1);
    }
    state.history = addEntry(state.history, entry);
    await browser.storage.local.set({ history: state.history, generated: state.generated, dismissed: [...state.dismissed] });
  }
  state.busy = null;
  applying = false;
  await reload();
  if (error) {
    toast(`Stopped: ${error}${entry.cards.length ? ` ${plural(entry.cards.length, "card was", "cards were")} changed before that.` : ""}`, { error: true, entry: entry.cards.length ? entry : null });
  } else {
    toast(`${title}.`, { entry });
  }
  return entry.cards.length ? entry : null;
}

async function undo(entry) {
  if (!entry || entry.undone || state.busy) {
    return;
  }
  applying = true;
  state.busy = { text: "Undoing…" };
  render();
  let result = await undoEntry(api, entry);
  if (!result.done && result.conflicts.length && !result.error) {
    state.busy = null;
    render();
    const reasons = { changed: "changed since", missing: "deleted since", exists: "is back already" };
    const go = await confirmDialog({
      title: "Some cards changed since",
      body: [
        h("p", {}, `Undoing "${entry.title}" puts these cards back as they were before it, and anything changed on them since is lost:`),
        h("ul", {}, result.conflicts.map((c) => h("li", {}, `${c.label}: ${reasons[c.reason]}`))),
      ],
      ok: "Undo anyway",
      danger: true,
    });
    if (!go) {
      applying = false;
      return;
    }
    state.busy = { text: "Undoing…" };
    render();
    result = await undoEntry(api, entry, { force: true });
  }
  if (result.done) {
    entry.undone = true;
    if (entry.generated) {
      trackGenerated(entry.generated, -1);
    }
    // Test builds 0.1.1 and 0.1.2 kept sorted people apart as part of a merge.
    (entry.dismissed ?? []).forEach((pair) => state.dismissed.delete(pair));
    await browser.storage.local.set({ history: state.history, generated: state.generated, dismissed: [...state.dismissed] });
  }
  state.busy = null;
  applying = false;
  await reload();
  toast(result.done ? `Undone: ${entry.title}.` : `Couldn't undo: ${result.error}`, { error: !result.done });
}

/* ---------- Toast and dialog ---------- */

let toastTimer = null;

function toast(text, { entry = null, error = false } = {}) {
  const el = document.getElementById("toast");
  clearTimeout(toastTimer);
  fill(el,
    h("span", {}, text),
    entry && !entry.undone ? h("button", { onClick: () => {
      el.hidden = true;
      undo(entry);
    } }, "Undo") : null,
    h("button", { class: "link", "aria-label": "Close", onClick: () => {
      el.hidden = true;
    } }, "✕"));
  el.className = `toast${error ? " error" : ""}`;
  el.hidden = false;
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, error ? 20000 : 12000);
}

function confirmDialog({ title, body, ok = "OK", cancel = "Cancel", danger = false }) {
  const root = document.getElementById("modal-root");
  return new Promise((resolve) => {
    const close = (value) => {
      root.replaceChildren();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        close(false);
      }
    };
    document.addEventListener("keydown", onKey);
    fill(root, h("div", { class: "overlay", onClick: (e) => {
      if (e.target === e.currentTarget) {
        close(false);
      }
    } },
    h("div", { class: "dialog", role: "dialog", "aria-modal": "true" },
      h("h2", {}, title),
      body,
      h("div", { class: "dialog-actions" },
        h("button", { onClick: () => close(false) }, cancel),
        h("button", { class: danger ? "primary danger" : "primary", onClick: () => close(true) }, ok)))));
    root.querySelector(".dialog-actions .primary")?.focus();
  });
}

/* ---------- Rendering ---------- */

function setView(view) {
  view = VIEW_ALIASES[view] ?? view;
  if (!VIEWS[view]) {
    return;
  }
  state.view = view;
  state.selected = null;
  state.newContact = null;
  state.chat.pick = null;
  state.merge = view === "duplicates" ? state.merge : null;
  history.replaceState(null, "", `#${view}`);
  render();
  VIEWS[view].onShow?.(ctx);
}

/** The newest change not undone yet. */
const lastEntry = () => state.history.find((e) => !e.undone);

function menus() {
  const view = (id) => ({ label: VIEWS[id].title, onClick: () => setView(id) });
  return [
    {
      title: "Edit",
      items: [
        { label: "Undo last change", hint: "Ctrl+Z", disabled: !lastEntry() || Boolean(state.busy), onClick: () => undo(lastEntry()) },
        { label: "Find", hint: "Ctrl+F", onClick: () => document.getElementById("search")?.focus() },
        { separator: true },
        { label: "Read the address books again", hint: "F5", onClick: () => reload() },
      ],
    },
    {
      title: "View",
      items: [
        view("contacts"),
        { separator: true },
        view("duplicates"), view("phones"), view("names"),
        { separator: true },
        view("chat"),
        { separator: true },
        view("history"),
        { separator: true },
        { label: "Theme", submenu: THEMES.map(([value, text]) => ({ label: text, checked: getThemePref() === value, onClick: () => chooseTheme(value) })) },
      ],
    },
    {
      title: "Help",
      items: [
        view("about"),
        { label: "Report a problem", onClick: () => openLink(LINKS.issues) },
        { separator: true },
        omemoMenuItem(),
        { label: "Daynizer", onClick: () => openLink(LINKS.daynizer) },
      ],
    },
  ];
}

/** Help's OMEMO item: the next add-on to get, or its settings once Pro is there. */
function omemoMenuItem() {
  switch (omemoTier(state.omemo.status)) {
    case "free":
      return { label: "OMEMO for Thunderbird + Calls", onClick: () => openLink(LINKS.omemoPro) };
    case "pro":
      return { label: "OMEMO settings", onClick: () => ctx.omemo.openOptions("settings").catch(() => {}) };
    default:
      return { label: "OMEMO for Thunderbird", onClick: () => openLink(LINKS.omemo) };
  }
}

function chooseTheme(theme) {
  applyTheme(theme);
  saveSettings({ theme });
}

function renderMenu() {
  const host = document.getElementById("menu-host");
  if (host) {
    fill(host, menuBar(menus(), renderMenu));
  }
}

/** Folds a sidebar category away, or opens it; remembered. */
function toggleCategory(id) {
  const collapsed = new Set(state.settings.collapsed ?? []);
  collapsed[collapsed.has(id) ? "delete" : "add"](id);
  saveSettings({ collapsed: [...collapsed] });
}

function renderSidebar() {
  const clickable = (props, onActivate) => ({
    ...props,
    role: "button",
    tabindex: "0",
    onClick: onActivate,
    onKeydown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  });
  const countBadge = (count) => (count === null || count === undefined ? null : h("span", { class: `count${count ? " has" : ""}` }, String(count)));
  const item = (id) => {
    const v = VIEWS[id];
    const count = state.loading ? null : v.count(ctx);
    const active = state.view === id && (id !== "contacts" || !state.contactsFilter);
    return h("div", clickable({ class: `sidebar-item${active ? " active" : ""}` }, () => {
      state.contactsFilter = null;
      setView(id);
    }),
    h("span", { class: "sidebar-dot", style: { background: v.dot } }),
    h("span", { class: "name" }, v.title),
    countBadge(count));
  };
  const labelItem = ([text, count]) => h("div", clickable({ class: `sidebar-item${state.view === "contacts" && state.contactsFilter === text ? " active" : ""}`, title: `Contacts with the label ${text}` }, () => {
    setView("contacts");
    state.contactsFilter = text;
    render();
  }),
  h("span", { class: "sidebar-dot", style: { background: "transparent", border: "1px solid var(--text-faint)" } }),
  h("span", { class: "name" }, text),
  countBadge(count));
  const collapsed = new Set(state.settings.collapsed ?? []);
  const category = (id, title, children) => [
    h("div", clickable({ class: "sidebar-section-label sidebar-toggle", "aria-expanded": String(!collapsed.has(id)), title: collapsed.has(id) ? `Show ${title}` : `Fold ${title} away` }, () => toggleCategory(id)),
      h("span", { class: "chevron", "aria-hidden": "true" }, collapsed.has(id) ? "\u25b8" : "\u25be"),
      title),
    collapsed.has(id) ? null : children,
  ];
  const excluded = new Set(state.settings.excludedBooks);
  const labels = state.loading ? [] : allLabels(state.cards);
  // Daynizer's order: Contacts, Address books, Labels, then this add-on's Clean up, Chat and More.
  // Thunderbird doesn't tell add-ons which address books sync (CardDAV books say remote: false too), so no ⇄ here.
  fill(document.getElementById("sidebar"),
    h("div", { class: "sidebar-header" }, h("img", { src: "../../icons/icon.svg", alt: "" }), "Contacts Cleanup"),
    h("div", { class: "sidebar-list", "data-scroll": "sidebar" },
      category("contacts", "Contacts", [item("contacts")]),
      category("books", "Address books", state.books.map((book) => {
        const locked = book.readOnly || book.remote;
        return h("label", { class: `sidebar-book${locked ? " disabled" : ""}`, title: locked ? "Read-only: left alone" : "Include this address book" },
          h("input", {
            type: "checkbox",
            checked: !locked && !excluded.has(book.id),
            disabled: locked || Boolean(state.busy),
            onChange: (e) => saveSettings({
              excludedBooks: e.target.checked ? state.settings.excludedBooks.filter((id) => id !== book.id) : [...state.settings.excludedBooks, book.id],
            }),
          }),
          h("span", { class: "name" }, book.name),
          h("span", { class: "count" }, locked ? "read-only" : String(book.contacts.length)));
      })),
      labels.length ? category("labels", "Labels", labels.map(labelItem)) : null,
      category("cleanup", "Clean up", [item("duplicates"), item("phones"), item("names")]),
      category("chat", "Chat", [item("chat"), omemoItem()]),
      category("more", "More", [item("history"), item("about")])),
    h("div", { class: "sidebar-footer" }, "Nothing changes until you apply or save it, and every change can be undone."));
}

/**
 * Under Chat, the next OMEMO add-on to get (its page, in the web browser):
 * OMEMO for Thunderbird when neither answers, OMEMO for Thunderbird + Calls
 * when the free one does; "OMEMO settings" once the calls version does.
 */
function omemoItem() {
  const item = {
    none: { text: "Get OMEMO for Thunderbird", icon: "\u2197", title: "End-to-end encrypted XMPP chat in Thunderbird. Opens its page in your web browser.", go: () => openLink(LINKS.omemo) },
    free: { text: "Get OMEMO + Calls", icon: "\u2197", title: "OMEMO for Thunderbird + Calls adds audio calls in Thunderbird, with JMP.chat numbers, Cheogram, Conversations and other XMPP apps. Opens its page in your web browser.", go: () => openLink(LINKS.omemoPro) },
    pro: { text: "OMEMO settings", icon: "\u2699", title: "Open the OMEMO add-on's settings", go: () => ctx.omemo.openOptions("settings").catch(() => {}) },
  }[omemoTier(state.omemo.status)];
  const go = item.go;
  return h("div", {
    class: "sidebar-item sidebar-link",
    role: "button",
    tabindex: "0",
    title: item.title,
    onClick: go,
    onKeydown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    },
  },
  h("span", { class: "sidebar-icon", "aria-hidden": "true" }, item.icon),
  h("span", { class: "name" }, item.text));
}

function renderProgress() {
  const el = document.getElementById("progress");
  if (el && state.busy) {
    el.textContent = state.busy.text ?? `Saving ${state.busy.done} of ${state.busy.total}…`;
  }
}

function renderMain() {
  const main = document.getElementById("main");
  const view = VIEWS[state.view];
  let body;
  if (state.loading) {
    body = h("div", { class: "empty-state" }, "Reading the address books…");
  } else if (state.loadError) {
    body = h("div", { class: "empty-state" }, h("div", { class: "big" }, "Couldn't read the address books."), state.loadError);
  } else {
    body = view.main(ctx);
  }
  fill(main,
    h("div", { id: "menu-host" }),
    repairBanner(),
    body,
    state.busy ? h("div", { class: "toolbar-filters" }, h("span", { id: "progress", class: "progress" })) : null);
  renderMenu();
  renderProgress();
}

/**
 * Thunderbird's Manifest V3 contacts bug left thousands of properties on the
 * cards earlier versions changed, which slows Thunderbird and this add-on
 * down. The bar offers to clear them; each card is saved again as it is.
 */
function repairBanner() {
  const junk = state.junk;
  if (state.loading || !junk?.cards) {
    return null;
  }
  return h("div", { class: "omemo-banner repair-banner" },
    h("span", {}, `${plural(junk.cards, "contact carries", "contacts carry")} ${junk.fields.toLocaleString()} leftover fields from a Thunderbird bug that earlier versions of this add-on ran into. They make Thunderbird and this add-on slow. The contact details are fine.`),
    h("button", { class: "primary small", disabled: Boolean(state.busy), onClick: () => repairAll() }, "Repair"));
}

async function repairAll() {
  const junk = state.junk;
  const go = await confirmDialog({
    title: `Repair ${plural(junk.cards, "contact", "contacts")}?`,
    body: [
      h("p", {}, `Removes the ${junk.fields.toLocaleString()} leftover fields Thunderbird stored on ${plural(junk.cards, "contact", "contacts")} (a field for every character of the card). Nothing on the contacts changes: each one is saved again as it is.`),
      h("p", {}, "Thunderbird uploads the saved contacts of synced address books (Google, CardDAV) to their server again, with the same details. That can take a few minutes for many contacts."),
    ],
    ok: "Repair",
  });
  if (!go) {
    return;
  }
  applying = true;
  let done = 0;
  let cleared = 0;
  const failed = [];
  for (const id of junk.ids) {
    state.busy = { text: `Repairing ${done + 1} of ${junk.ids.length}…` };
    renderProgress();
    try {
      cleared += await api.repair(id);
    } catch (e) {
      failed.push(e?.message ?? String(e));
    }
    done++;
  }
  state.busy = null;
  applying = false;
  await reload();
  toast(failed.length
    ? `Repaired ${done - failed.length} of ${done} contacts (${cleared.toLocaleString()} fields removed). ${failed.length} couldn't be saved: ${failed[0]}`
    : `Repaired ${plural(done, "contact", "contacts")}: ${cleared.toLocaleString()} leftover fields removed.`, { error: failed.length > 0 });
}

function renderRail() {
  const view = VIEWS[state.view];
  fill(document.getElementById("rail"), h("div", { class: "detail-panel", "data-scroll": "detail" }, state.loading ? null : view.detail(ctx)));
}

/** Renders everything, keeping focus, text selection and scroll positions. */
function render() {
  const active = document.activeElement;
  const focus = active?.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  const scroll = {};
  for (const el of document.querySelectorAll("[data-scroll]")) {
    scroll[el.dataset.scroll] = el.scrollTop;
  }
  renderSidebar();
  renderMain();
  renderRail();
  for (const el of document.querySelectorAll("[data-scroll]")) {
    if (scroll[el.dataset.scroll]) {
      el.scrollTop = scroll[el.dataset.scroll];
    }
  }
  if (focus) {
    const el = document.getElementById(focus.id);
    if (el) {
      el.focus();
      if (typeof focus.start === "number" && el.setSelectionRange) {
        try {
          el.setSelectionRange(focus.start, focus.end);
        } catch {
          // Not a text field.
        }
      }
    }
  }
}

/* ---------- Start ---------- */

document.addEventListener("keydown", (e) => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inField) {
    e.preventDefault();
    undo(lastEntry());
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    const search = document.getElementById("search");
    if (search) {
      e.preventDefault();
      search.focus();
      search.select();
    }
  } else if (e.key === "F5") {
    e.preventDefault();
    reload();
  }
});

// The toolbar button or Tools menu, while this tab is open: come to the front.
browser.runtime.onMessage.addListener((message) => {
  if (message?.command !== "focus") {
    return undefined;
  }
  return (async () => {
    const tab = await browser.tabs.getCurrent();
    await browser.tabs.update(tab.id, { active: true });
    await browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
    return true;
  })();
});

window.addEventListener("hashchange", () => {
  const hash = location.hash.slice(1);
  const view = VIEW_ALIASES[hash] ?? hash;
  if (VIEWS[view] && view !== state.view) {
    setView(view);
  }
});

(async () => {
  const stored = await browser.storage.local.get(["settings", "dismissed", "generated", "history"]);
  state.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  state.dismissed = new Set(stored.dismissed ?? []);
  state.generated = stored.generated ?? {};
  state.history = stored.history ?? [];
  initTheme(state.settings.theme);
  onPhotosLoaded(render);
  const hash = location.hash.slice(1);
  const view = VIEW_ALIASES[hash] ?? hash;
  if (VIEWS[view]) {
    state.view = view;
  }
  render();
  onAddressBookChange(async () => {
    if (!applying) {
      await reload();
    }
    VIEWS[state.view].onCardsChanged?.(ctx);
  });
  await reload();
  VIEWS[state.view].onShow?.(ctx);
  // What OMEMO for Thunderbird says (whether it's there, the chat list), for the sidebar, the Chat page and the editor's In chat list.
  if (!state.omemo.status && !state.omemo.loading) {
    await refreshOmemo(ctx);
  }
})();
