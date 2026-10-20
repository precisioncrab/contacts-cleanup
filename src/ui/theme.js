/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * View > Theme, the way Daynizer does it: "system" follows Thunderbird's
 * own theme, or always "light" or "dark". The theme showing goes on
 * <html data-theme>, which tab.css's color tokens key off. Saved in
 * storage.local; a localStorage copy lets theme-boot.js paint the first
 * frame in the right colors.
 */

const CACHE_KEY = "contactsCleanup.theme";
const media = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

let pref = "system";

export const THEMES = [
  ["system", "Match System"],
  ["light", "Light Mode"],
  ["dark", "Dark Mode"],
];

export const normalizeTheme = (value) => (value === "light" || value === "dark" ? value : "system");

export function resolvedTheme() {
  if (pref !== "system") {
    return pref;
  }
  return media && !media.matches ? "light" : "dark";
}

function render() {
  document.documentElement.dataset.theme = resolvedTheme();
}

/** Shows a theme and remembers it for the next first paint. */
export function applyTheme(next) {
  pref = normalizeTheme(next);
  try {
    localStorage.setItem(CACHE_KEY, pref);
  } catch {
    // Storage unavailable.
  }
  render();
}

export const getThemePref = () => pref;

/** Call once at startup. */
export function initTheme(saved) {
  let cached = "system";
  try {
    cached = normalizeTheme(localStorage.getItem(CACHE_KEY));
  } catch {
    // Storage unavailable.
  }
  pref = normalizeTheme(saved ?? cached);
  media?.addEventListener("change", () => {
    if (pref === "system") {
      render();
    }
  });
  render();
}
