/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Opens Contacts Cleanup as a Thunderbird tab, from its toolbar button or
 * Tools > Contacts Cleanup. The official API can't add anything inside the
 * address book itself (no right-click on cards, no button in its toolbar),
 * so the tab's buttons do that work. If the tab is open already, it comes
 * to the front instead of opening twice.
 */

const TAB_URL = browser.runtime.getURL("src/ui/tab.html");

// An open tab answers "focus" by bringing itself to the front (no "tabs"
// permission needed to find it); no answer means there's none.
async function openTab() {
  const focused = await browser.runtime.sendMessage({ command: "focus" }).catch(() => false);
  if (!focused) {
    await browser.tabs.create({ url: TAB_URL });
  }
}

browser.action.onClicked.addListener(openTab);

const MENU_ID = "contacts-cleanup-open";

// Menus last across restarts for an event page; made again on install and
// update, and checked at startup in case they were lost.
async function createMenu() {
  await browser.menus.removeAll();
  browser.menus.create({ id: MENU_ID, title: "Contacts Cleanup", contexts: ["tools_menu"] });
}

browser.runtime.onInstalled.addListener(createMenu);
browser.runtime.onStartup.addListener(createMenu);

browser.menus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID) {
    openTab();
  }
});
