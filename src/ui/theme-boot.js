/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The saved theme, before the first paint (src/ui/theme.js keeps the copy
// in localStorage up to date). "system" follows Thunderbird's own theme.
(() => {
  let pref = "system";
  try {
    pref = localStorage.getItem("contactsCleanup.theme") || "system";
  } catch {
    // Storage unavailable: follow Thunderbird.
  }
  const dark = pref === "dark" || (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
