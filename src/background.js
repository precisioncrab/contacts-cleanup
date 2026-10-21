/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Opens Contacts Cleanup as a Thunderbird tab: from its button in the
 * spaces toolbar (the left sidebar with Mail, Address Book and Calendar,
 * as Daynizer has), its toolbar button, or Tools > Contacts Cleanup. The
 * official API can't add anything inside the address book itself (no
 * right-click on cards, no button in its toolbar), so the tab's buttons
 * do that work. All three open the same space tab, never a second one.
 */

const TAB_URL = browser.runtime.getURL("src/ui/tab.html");
const SPACE_NAME = "contacts_cleanup";

/**
 * The sidebar button. Thunderbird keeps add-on spaces in memory only, so
 * this runs at every start (runtime.onStartup wakes the event page) and
 * whenever the page wakes; it updates the space if it's there already.
 */
async function ensureSpace() {
  const spaces = browser.spaces;
  if (!spaces) {
    return null;
  }
  const button = { title: "Contacts Cleanup", defaultIcons: { 16: "icons/icon.svg", 32: "icons/icon.svg" } };
  try {
    const [existing] = await spaces.query({ name: SPACE_NAME });
    if (existing) {
      await spaces.update(existing.id, TAB_URL, button);
      return existing.id;
    }
    return (await spaces.create(SPACE_NAME, TAB_URL, button)).id;
  } catch (e) {
    console.warn(`[contacts-cleanup] sidebar button not added: ${e?.message ?? e}`);
    return null;
  }
}

const spaceReady = ensureSpace();
browser.runtime.onStartup.addListener(() => {
  ensureSpace();
});

async function openTab() {
  const spaceId = await spaceReady;
  if (spaceId) {
    try {
      await browser.spaces.open(spaceId);
      return;
    } catch {
      // Fall back to a plain tab below.
    }
  }
  // An open tab answers "focus" by bringing itself to the front (no "tabs"
  // permission needed to find it); no answer means there's none.
  const focused = await browser.runtime.sendMessage({ command: "focus" }).catch(() => false);
  if (!focused) {
    await browser.tabs.create({ url: TAB_URL });
  }
}

// Manifest V2 (see src/lib/addressbook.js for why): the toolbar button is browserAction.
(browser.browserAction ?? browser.action).onClicked.addListener(openTab);

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
