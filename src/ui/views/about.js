/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** About: what the add-on does and can reach, and the related add-ons. */

import { h } from "../dom.js";
import { toolbar } from "../parts.js";
import { LINKS, openLink } from "../../lib/links.js";

const link = (text, url) => h("button", { class: "link", onClick: () => openLink(url) }, text);

export default {
  id: "about",
  title: "About",
  dot: "#8a8d93",

  count: () => null,

  main(ctx) {
    const version = browser.runtime.getManifest().version;
    return [
      toolbar(ctx, { title: "About Contacts Cleanup", search: false }),
      h("div", { class: "page", "data-scroll": "page" },
        h("p", {}, `Version ${version}. A free Thunderbird add-on by Precision Crab that tidies your address book and gets your contacts ready for chat: duplicates, phone numbers in one format, missing names, and XMPP chat addresses on cards.`),
        h("p", {}, "Nothing changes until you look at a proposed change and apply it, and every applied change can be undone (Changes)."),

        h("div", { class: "page-section" }, h("div", { class: "label" }, "What this add-on can access"),
          h("p", {}, "Your address books, to read cards and to change the ones you apply changes to. Read-only address books are left alone."),
          h("p", {}, "Nothing else: it makes no network connections and sends nothing anywhere. Its settings and the undo history stay in Thunderbird's own add-on storage. If OMEMO for Thunderbird is installed, the Chat page asks it for your chat list and to name your chat contacts; that's the only other add-on it talks to.")),

        h("div", { class: "page-section" }, h("div", { class: "label" }, "Related add-ons"),
          h("div", { class: "about-links" },
            h("div", {}, link("OMEMO for Thunderbird", LINKS.omemo), ": end-to-end encrypted XMPP chat in Thunderbird (free)."),
            h("div", {}, link("OMEMO Pro for Thunderbird", LINKS.omemoPro), ": adds audio calls."),
            h("div", {}, link("Daynizer", LINKS.daynizer), ": tasks, calendar and contacts with CalDAV and CardDAV sync, in Thunderbird."))),

        h("div", { class: "page-section" }, h("div", { class: "label" }, "Source and license"),
          h("p", {}, "Open source under the Mozilla Public License 2.0, built only on Thunderbird's official add-on APIs."),
          h("div", { class: "about-links" },
            h("div", {}, link("Source code", LINKS.source)),
            h("div", {}, link("Report a problem", LINKS.issues))))),
    ];
  },

  detail() {
    return [
      h("h3", {}, "Where it runs"),
      h("p", {}, "Contacts Cleanup opens as a tab, from its button in the left sidebar (with Mail, Address Book and Calendar), its toolbar button, or Tools > Contacts Cleanup. Thunderbird doesn't let add-ons on addons.thunderbird.net add buttons or right-click items inside the address book, so this tab's buttons do that work."),
      h("h3", { style: { marginTop: "16px" } }, "Theme"),
      h("p", {}, "View > Theme: Match System follows Thunderbird's own light or dark theme."),
    ];
  },
};
