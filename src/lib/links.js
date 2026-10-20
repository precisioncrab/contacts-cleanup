/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Where this add-on points people: the one place to change a link (for
 * example when OMEMO Pro's Gumroad listing goes live).
 */

export const LINKS = {
  source: "https://github.com/precisioncrab/contacts-cleanup",
  issues: "https://github.com/precisioncrab/contacts-cleanup/issues",
  omemo: "https://github.com/precisioncrab/thunderbird-omemo",
  omemoInstall: "https://github.com/precisioncrab/thunderbird-omemo#install",
  omemoPro: "https://github.com/precisioncrab/thunderbird-omemo#omemo-pro-for-thunderbird",
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
