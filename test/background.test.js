/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The background script, loaded the way Thunderbird does with a fake
// browser API: the sidebar (spaces toolbar) button, and the toolbar
// button and Tools menu opening that same space.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
const event = () => ({ listeners: [], addListener(f) {
  this.listeners.push(f);
} });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function load({ spaces = true, existing = [], tabOpen = false } = {}) {
  const calls = [];
  const browser = {
    runtime: {
      getURL: (path) => `moz-extension://cc/${path}`,
      onStartup: event(),
      onInstalled: event(),
      sendMessage: async (message) => {
        calls.push(["sendMessage", message.command]);
        if (!tabOpen) {
          throw new Error("Could not establish connection. Receiving end does not exist.");
        }
        return true;
      },
    },
    browserAction: { onClicked: event() },
    menus: { onClicked: event(), removeAll: async () => calls.push(["menus.removeAll"]), create: (props) => calls.push(["menus.create", props.contexts[0]]) },
    tabs: { create: async ({ url }) => calls.push(["tabs.create", url]) },
    spaces: spaces ? {
      query: async ({ name }) => existing.filter((s) => s.name === name),
      create: async (name, url, button) => {
        calls.push(["spaces.create", name, url, button.title]);
        return { id: 7, name };
      },
      update: async (id, url) => calls.push(["spaces.update", id, url]),
      open: async (id) => calls.push(["spaces.open", id]),
    } : undefined,
    windows: {},
  };
  const context = vm.createContext({ browser, console: { warn: (line) => calls.push(["warn", line]), log() {} } });
  vm.runInContext(source, context);
  return { browser, calls };
}

test("adds the sidebar button, and the toolbar button opens that space", async () => {
  const { browser, calls } = load();
  await settle();
  assert.deepEqual(calls[0], ["spaces.create", "contacts_cleanup", "moz-extension://cc/src/ui/tab.html", "Contacts Cleanup"]);
  await browser.browserAction.onClicked.listeners[0]();
  assert.deepEqual(calls.at(-1), ["spaces.open", 7]);
});

test("a space that's there already is updated, not made twice", async () => {
  const { calls } = load({ existing: [{ id: 3, name: "contacts_cleanup" }] });
  await settle();
  assert.deepEqual(calls[0], ["spaces.update", 3, "moz-extension://cc/src/ui/tab.html"]);
  assert.ok(!calls.some((c) => c[0] === "spaces.create"));
});

test("at every start the button is added again (Thunderbird forgets add-on spaces)", async () => {
  const { browser, calls } = load();
  await settle();
  for (const listener of browser.runtime.onStartup.listeners) {
    await listener();
  }
  assert.equal(calls.filter((c) => c[0] === "spaces.create").length, 2);
});

test("without spaces: an open tab comes to the front, else a new tab", async () => {
  const open = load({ spaces: false, tabOpen: true });
  await open.browser.browserAction.onClicked.listeners[0]();
  assert.deepEqual(open.calls.filter((c) => c[0] !== "warn"), [["sendMessage", "focus"]]);
  const closed = load({ spaces: false });
  await closed.browser.menus.onClicked.listeners[0]({ menuItemId: "contacts-cleanup-open" });
  await settle();
  assert.deepEqual(closed.calls.at(-1), ["tabs.create", "moz-extension://cc/src/ui/tab.html"]);
});

test("Tools > Contacts Cleanup is made on install", async () => {
  const { browser, calls } = load();
  await browser.runtime.onInstalled.listeners[0]();
  assert.deepEqual(calls.filter((c) => c[0].startsWith("menus")), [["menus.removeAll"], ["menus.create", "tools_menu"]]);
});
