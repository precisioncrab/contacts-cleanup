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
import { menuBar } from "./menu.js";
import { THEMES, applyTheme, getThemePref, initTheme } from "./theme.js";
import { loadBooks, api, onAddressBookChange } from "../lib/addressbook.js";
import { omemoClient } from "../lib/omemo.js";
import { LINKS, openLink } from "../lib/links.js";
import { readCard, label } from "../core/card.js";
import { findDuplicates, suggestPeople } from "../core/duplicates.js";
import { phoneFixes, proposeName } from "../core/fixes.js";
import { chatState, prefixFixes, DEFAULT_GATEWAY } from "../core/chat.js";
import { countryById } from "../core/phone.js";
import { applyChanges, undoEntry, addEntry } from "../core/history.js";
import duplicates from "./views/duplicates.js";
import phones from "./views/phones.js";
import names from "./views/names.js";
import chat from "./views/chat.js";
import chatContacts from "./views/chat-contacts.js";
import changesView from "./views/history.js";
import about from "./views/about.js";

const VIEWS = { duplicates, phones, names, chat, chatContacts, history: changesView, about };

const DEFAULT_SETTINGS = { theme: "system", excludedBooks: [], phoneStyle: "international", country: "nanp", gateway: DEFAULT_GATEWAY, duplicatesAcrossBooks: false };

const state = {
  view: "duplicates",
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
  chatStaged: new Map(),
  chatNumber: new Map(),
  chatTab: "phones",
  chatFilter: "all",
  prefixOff: new Set(),
  merge: null,
  omemo: { loading: false, status: null, result: null, error: null },
};

const derived = { duplicates: [], phones: [], names: [], chat: [], prefix: [] };

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
    render();
  },
  setView,
  saveSettings,
  dismiss,
  apply,
  undo,
};

/* ---------- Data ---------- */

function recompute() {
  const s = state.settings;
  const country = countryById(s.country);
  derived.duplicates = findDuplicates(state.cards, state.dismissed, { acrossBooks: s.duplicatesAcrossBooks })
    .map((group) => ({ ...group, suggested: suggestPeople(group.cards, state.dismissed) }));
  derived.phones = state.cards
    .map((card) => ({ card, ...phoneFixes(card, { style: s.phoneStyle, country }) }))
    .filter((p) => p.fixes.length || p.skipped.length);
  derived.names = state.cards.map((card) => ({ card, proposal: proposeName(card) })).filter((n) => n.proposal);
  derived.chat = state.cards
    .filter((card) => card.phones.length)
    .map((card) => ({ card, ...chatState(card, state.generated[card.id] ?? []) }));
  derived.prefix = state.cards.map((card) => ({ card, fixes: prefixFixes(card) })).filter((p) => p.fixes.length);
}

async function reload() {
  try {
    state.books = await loadBooks();
    state.loadError = null;
  } catch (e) {
    state.books = [];
    state.loadError = e?.message ?? String(e);
  }
  const excluded = new Set(state.settings.excludedBooks);
  state.cards = state.books
    .filter((book) => !book.readOnly && !book.remote && !excluded.has(book.id))
    .flatMap((book) => book.contacts.filter((node) => !node.readOnly).map((node) => readCard(node, book.name)))
    .sort((a, b) => label(a).localeCompare(label(b)));
  const ids = new Set(state.cards.map((c) => c.id));
  for (const map of [state.nameEdits, state.nameOn, state.chatStaged, state.chatNumber]) {
    for (const id of map.keys()) {
      if (!ids.has(id)) {
        map.delete(id);
      }
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
 * and offers Undo. `extra.generated` is { added, removed } chat addresses;
 * `extra.dismissed` are duplicate pairs to keep apart once every change
 * went through (a sorted group's people). Returns the history entry, or
 * null when nothing was changed.
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
    if (!error && extra.dismissed?.length) {
      entry.dismissed = extra.dismissed.filter((pair) => !state.dismissed.has(pair));
      entry.dismissed.forEach((pair) => state.dismissed.add(pair));
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
    // The people kept apart by this change may group again.
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
  if (!VIEWS[view]) {
    return;
  }
  state.view = view;
  state.selected = null;
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
        view("duplicates"), view("phones"), view("names"), view("chat"), view("chatContacts"),
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
        { label: "OMEMO for Thunderbird", onClick: () => openLink(LINKS.omemo) },
        { label: "Daynizer", onClick: () => openLink(LINKS.daynizer) },
      ],
    },
  ];
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

function renderSidebar() {
  const item = (id) => {
    const v = VIEWS[id];
    const count = state.loading ? null : v.count(ctx);
    return h("div", {
      class: `sidebar-item${state.view === id ? " active" : ""}`,
      role: "button",
      tabindex: "0",
      onClick: () => setView(id),
      onKeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setView(id);
        }
      },
    },
    h("span", { class: "sidebar-dot", style: { background: v.dot } }),
    h("span", { class: "name" }, v.title),
    count === null || count === undefined ? null : h("span", { class: `count${count ? " has" : ""}` }, String(count)));
  };
  const excluded = new Set(state.settings.excludedBooks);
  fill(document.getElementById("sidebar"),
    h("div", { class: "sidebar-header" }, h("img", { src: "../../icons/icon.svg", alt: "" }), "Contacts Cleanup"),
    h("div", { class: "sidebar-list", "data-scroll": "sidebar" },
      h("div", { class: "sidebar-section-label" }, "Clean up"),
      item("duplicates"), item("phones"), item("names"),
      h("div", { class: "sidebar-section-label" }, "Chat"),
      item("chat"), item("chatContacts"),
      h("div", { class: "sidebar-section-label" }, "More"),
      item("history"), item("about"),
      h("div", { class: "sidebar-section-label" }, "Address books"),
      state.books.map((book) => {
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
    h("div", { class: "sidebar-footer" }, "Nothing changes until you apply it, and every change can be undone."));
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
    body,
    state.busy ? h("div", { class: "toolbar-filters" }, h("span", { id: "progress", class: "progress" })) : null);
  renderMenu();
  renderProgress();
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
  const view = location.hash.slice(1);
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
  const view = location.hash.slice(1);
  if (VIEWS[view]) {
    state.view = view;
  }
  render();
  onAddressBookChange(() => {
    if (!applying) {
      reload();
    }
  });
  await reload();
  VIEWS[state.view].onShow?.(ctx);
})();
