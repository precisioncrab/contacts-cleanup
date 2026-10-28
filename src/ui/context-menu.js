/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A right-click menu, like Daynizer's (class "context-menu"). Items:
 * { label, onClick, danger, disabled, separator, checked, title } or
 * { colors: [{ name, color }], current, onPick } for a row of color dots
 * (onPick(null) is "No color"), or { label, submenu: [items] } for items
 * that open beside it on hover. `checked` (true or false) puts a tick
 * column in front of the label.
 */

import { h } from "./dom.js";

// The colors Daynizer offers for address books and labels.
export const PALETTE = [
  { name: "Blue", color: "#4a90d9" },
  { name: "Red", color: "#e5484d" },
  { name: "Amber", color: "#e8a23d" },
  { name: "Green", color: "#3fb950" },
  { name: "Purple", color: "#a371f7" },
  { name: "Pink", color: "#db61a2" },
  { name: "Gray", color: "#6f7378" },
];

let current = null;

function close() {
  current?.remove();
  current = null;
  document.removeEventListener("mousedown", onOutside, true);
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("blur", close);
  window.removeEventListener("resize", close);
}

function onOutside(e) {
  if (current && !current.contains(e.target)) {
    close();
  }
}

function onKey(e) {
  if (e.key === "Escape") {
    e.stopPropagation();
    close();
  }
}

/** Opens the menu at the mouse (kept on screen); one at a time. */
export function openContextMenu(event, items) {
  event.preventDefault();
  close();
  const pick = (fn) => () => {
    close();
    fn?.();
  };
  let openSub = null;
  const build = (list) => list.filter(Boolean).map((item) => {
    if (item.separator) {
      return h("div", { class: "separator" });
    }
    if (item.colors) {
      return h("div", { class: "colors" },
        item.colors.map((c) => h("button", {
          class: `swatch${item.current === c.color ? " on" : ""}`,
          title: c.name,
          "aria-label": c.name,
          style: { background: c.color },
          onClick: pick(() => item.onPick(c.color)),
        })),
        h("button", { class: `swatch none${item.current ? "" : " on"}`, title: "No color", "aria-label": "No color", onClick: pick(() => item.onPick(null)) }));
    }
    if (item.submenu) {
      const el = h("div", { class: `item has-sub${item.disabled ? " disabled" : ""}`, role: "menuitem", "aria-haspopup": "true", title: item.title ?? null },
        h("span", {}, item.label), h("span", { class: "sub-arrow", "aria-hidden": "true" }, "▸"));
      const show = () => {
        if (item.disabled || openSub?.owner === el) {
          return;
        }
        openSub?.remove();
        const sub = h("div", { class: "context-menu sub", role: "menu" }, build(item.submenu));
        sub.owner = el;
        current.append(sub);
        const at = el.getBoundingClientRect();
        place(sub, at.right - 2, at.top - 4, at.left + 2);
        openSub = sub;
      };
      el.addEventListener("mouseenter", show);
      el.addEventListener("click", show);
      return el;
    }
    const tick = item.checked === undefined ? null : h("span", { class: "tick", "aria-hidden": "true" }, item.checked ? "✓" : "");
    return h("div", {
      class: `item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`,
      role: item.checked === undefined ? "menuitem" : "menuitemcheckbox",
      "aria-checked": item.checked === undefined ? null : String(item.checked),
      title: item.title ?? null,
      // Moving onto a plain item of the top menu closes an open submenu.
      onMouseenter: (e) => {
        if (openSub && e.currentTarget.parentElement === current) {
          openSub.remove();
          openSub = null;
        }
      },
      onClick: item.disabled ? null : pick(item.onClick),
    }, tick, item.label);
  });
  current = h("div", { class: "context-menu", role: "menu" }, build(items));
  document.body.append(current);
  place(current, event.clientX, event.clientY);
  document.addEventListener("mousedown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", close);
  window.addEventListener("resize", close);
}

/** Puts a menu at (x, y), kept on screen; a submenu that won't fit on the right goes left of `flipX`. */
function place(menu, x, y, flipX = null) {
  const { width, height } = menu.getBoundingClientRect();
  const margin = 8;
  const left = flipX !== null && x + width > window.innerWidth - margin ? flipX - width : x;
  menu.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - height - margin))}px`;
}
