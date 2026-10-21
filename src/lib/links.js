/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Where this add-on points people: the one place to change a link.
 */

export const LINKS = {
  source: "https://github.com/precisioncrab/contacts-cleanup",
  issues: "https://github.com/precisioncrab/contacts-cleanup/issues",
  // OMEMO for Thunderbird's Gumroad page (free, pay what you want).
  omemo: "https://precisioncrab.gumroad.com/l/omemo",
  // OMEMO Pro for Thunderbird's Gumroad page (paid, adds calls).
  omemoPro: "https://precisioncrab.gumroad.com/l/omemo-pro",
  daynizer: "https://addons.thunderbird.net/en-US/thunderbird/addon/daynizer/",
  jmp: "https://jmp.chat/",
};

/** Opens a link in the default web browser (not in a Thunderbird tab). */
export function openLink(url) {
  if (browser.windows?.openDefaultBrowser) {
    return browser.windows.openDefaultBrowser(url);
  }
  return browser.tabs.create({ url });
}
