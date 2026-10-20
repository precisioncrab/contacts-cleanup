# addons.thunderbird.net listing (draft)

_Drafted 2026-10-20. Accurate wording only, no keyword stuffing (ATN reviewers reject it). "XMPP" goes in the summary, "OMEMO" in the description (decided 2026-10-18)._

## Name
Contacts Cleanup

## Summary (250 characters at most)
Cleans up your address book: merges duplicate contacts, puts phone numbers in one format, fills in missing names, and adds XMPP chat addresses (including JMP.chat addresses for texting phone numbers) to contact cards.

## Description

Contacts Cleanup tidies Thunderbird's address book and gets your contacts ready for chat. Nothing changes until you look at a proposed change and apply it, and every applied change can be undone.

**Duplicates.** Finds cards that look like the same person: the same email address, the same phone number in any format, the same chat address, or the same name, across all your address books. You pick the card to keep and what it keeps; every value starts checked, so nothing is lost unless you uncheck it.

**Phone numbers in one format.** +1 555 123 4567, or compact +15551234567. Numbers without a country code are read as US and Canada, or another country you pick. Numbers with an extension are left alone.

**Missing names.** Cards without a display name get one from the first and last name, the organization, the nickname or the email address, and you can change each before applying.

**Chat addresses.** Adds XMPP chat addresses to your contacts, written the way Thunderbird's own card editor wants them. For phone contacts it makes JMP.chat addresses (+15551234567@cheogram.com), which let an XMPP account registered with JMP.chat text and call those phone numbers: check the people you want, select all phone contacts, or generate one for a single person. It also fixes chat addresses other apps saved in a form Thunderbird's card editor refuses.

**Chat contacts and OMEMO.** With OMEMO for Thunderbird installed (free, open source), your XMPP chat contacts in Thunderbird get their names from your address book, and your chats can be end-to-end encrypted with OMEMO, the encryption Conversations, Cheogram and Gajim use. OMEMO for Thunderbird needs access to Thunderbird's chat, which add-ons on this site can't have, so it's installed from its own page: https://github.com/precisioncrab/thunderbird-omemo

**Undo.** The Changes page lists everything applied, and Undo puts the cards back, deleted ones included.

It opens as a tab from its toolbar button or Tools > Contacts Cleanup, in light or dark (it follows Thunderbird's theme, or pick one).

**What it can access:** your address books, to read cards and change the ones you apply changes to. It makes no network connections and sends nothing anywhere.

Also by Precision Crab: Daynizer, tasks, calendar and contacts with CalDAV and CardDAV sync in Thunderbird (https://addons.thunderbird.net/thunderbird/addon/daynizer/).

Source code (MPL-2.0): https://github.com/precisioncrab/contacts-cleanup

## Details
- Categories: Contacts (and Miscellaneous if a second is wanted).
- License: Mozilla Public License 2.0.
- Support site: https://github.com/precisioncrab/contacts-cleanup/issues
- Homepage: the precisioncrab.com page for it, once it exists (else the GitHub repo).
- Source code upload: not needed. Nothing is minified, bundled or generated; the package is the source.
- Screenshots to take (made-up cards): Duplicates list, the merge page, Phone numbers, Chat addresses with the help panel, one in light and one in dark.

## Notes for the reviewer
Contacts Cleanup uses only the addressBooks, addressBooks.contacts, menus and storage APIs. Changes are written with addressBooks.contacts.update and create (vCard text), always after the user clicks Apply; each card's previous vCard is kept in storage.local for undo. The Chat contacts page sends runtime.sendMessage to one other add-on (thunderbird-omemo@precisioncrab) if the user has it; nothing else leaves the add-on.

## Open (maintainer)
- The Chat contacts page and this description point to OMEMO for Thunderbird, which is installed from file and needs `xpinstall.signatures.required` turned off. A reviewer could object to sending people toward an unsigned add-on. Our text never mentions turning signatures off; that's on the OMEMO page itself. If a reviewer objects, the fallback is to drop the link from the listing and keep the in-app page.
