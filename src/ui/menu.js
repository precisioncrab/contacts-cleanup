/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The Edit / View / Help menu bar, like Daynizer's add-on menu bar (a
 * Thunderbird tab has no menu of its own). Items:
 * { label, hint, onClick, disabled, checked, submenu, separator }.
 */

import { h } from "./dom.js";

let openMenu = null;
let openSub = null;
let rerender = () => {};

document.addEventListener("mousedown", (event) => {
  if (openMenu && !event.target.closest?.(".menu-bar")) {
    openMenu = null;
    rerender();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openMenu) {
    openMenu = null;
    rerender();
  }
});

/** The menu bar element for these menus: [{ title, items }]. */
export function menuBar(menus, render) {
  rerender = render;
  const close = () => {
    openMenu = null;
    openSub = null;
    render();
  };

  const items = (list, nested) => list.map((item) => {
    if (item.separator) {
      return h("div", { class: "menu-separator" });
    }
    if (item.submenu) {
      const isOpen = openSub === item.label;
      return h("div", {
        class: `menu-dropdown-item${isOpen ? " open" : ""}`,
        onMouseEnter: () => {
          if (openSub !== item.label) {
            openSub = item.label;
            render();
          }
        },
        onClick: () => {
          openSub = isOpen ? null : item.label;
          render();
        },
      },
      h("span", {}, item.label),
      h("span", { class: "menu-hint" }, "▸"),
      isOpen && h("div", { class: "menu-dropdown menu-submenu", onClick: (e) => e.stopPropagation() }, items(item.submenu, true)));
    }
    return h("div", {
      class: `menu-dropdown-item${item.disabled ? " disabled" : ""}`,
      onMouseEnter: nested || !openSub ? null : () => {
        openSub = null;
        render();
      },
      onClick: () => {
        if (item.disabled) {
          return;
        }
        close();
        item.onClick?.();
      },
    },
    h("span", {}, item.checked !== undefined && h("span", { class: "menu-check" }, item.checked ? "✓" : ""), item.label),
    item.hint && h("span", { class: "menu-hint" }, item.hint));
  });

  return h("div", { class: "menu-bar" }, menus.map((menu) => h("div", { class: "menu-bar-item" },
    h("button", {
      class: `menu-bar-title${openMenu === menu.title ? " active" : ""}`,
      onClick: () => {
        openMenu = openMenu === menu.title ? null : menu.title;
        openSub = null;
        render();
      },
      onMouseEnter: () => {
        if (openMenu && openMenu !== menu.title) {
          openMenu = menu.title;
          openSub = null;
          render();
        }
      },
    }, menu.title),
    openMenu === menu.title && h("div", { class: "menu-dropdown" }, items(menu.items, false)))));
}
