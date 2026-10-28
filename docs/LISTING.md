# addons.thunderbird.net listing (draft)

_Drafted 2026-10-20. Accurate wording only, no keyword stuffing (ATN reviewers reject it). "XMPP" goes in the summary, "OMEMO" in the description (decided 2026-10-18)._

## Name
Contacts Cleanup

## Summary (250 characters at most)
Cleans up your address book: merges duplicate contacts, puts phone numbers in one format, fills in missing names, and adds XMPP chat addresses (including JMP.chat addresses for texting phone numbers) to contact cards.

## Description

Contacts Cleanup tidies Thunderbird's address book and gets your contacts ready for chat. Nothing changes until you look at a proposed change and apply it, and every applied change can be undone.

**Duplicates.** Finds cards that look like the same person: the same email address, the same phone number in any format, the same chat address, or the same name, across all your address books. You check the cards that are really the same person, pick the card to keep and what it keeps (and rename it if you like), and click Merge; every value starts checked, so nothing is lost unless you uncheck it. A card you don't want at all can just be deleted.

**The same contact in several address books.** A contact copied into another address book with its contact ID can only be changed in one of the copies by add-ons. Contacts Cleanup lists them and lets you choose, for all of them at once or one at a time: link the copies (they get the same details, and an edit to one is made to the others), keep one copy (the other address books become labels on it), separate them, or leave them.

**Address books and mailing lists to labels.** Turns an address book or a mailing list into a label on its contacts, which syncs with them. The contacts can then move into another address book, and the emptied mailing list or address book can be deleted. Right-click an address book or a mailing list to rename or delete it (deleting asks first).

**Phone numbers in one format.** +1 555 123 4567, or compact +15551234567. Numbers without a country code are read as US and Canada, or another country you pick. Numbers with an extension are left alone.

**Missing names.** Cards without a display name get one from the first and last name, the organization, the nickname or the email address, and you can change each before applying.

**Chat addresses.** Adds XMPP chat addresses to your contacts, written the way Thunderbird's own card editor wants them. For phone contacts it makes JMP.chat addresses (+15551234567@cheogram.com), which let an XMPP account registered with JMP.chat text and call those phone numbers: check the people you want, select all, or add one in a contact's editor. It also fixes chat addresses other apps saved in a form Thunderbird's card editor refuses.

**Manage your contacts.** All contacts, with search, new contacts, vCard import (into any address book or a new one, with a label on each if you like), labels and an editor for every field, like Daynizer's Contacts tab. Right-click a contact to give it a label or put it on a mailing list. Right-click an address book or a label in the sidebar to rename it, give it a color or hide it (a hidden address book is left out with its contacts until you show it again); labels can be deleted from their contacts the same way. The sidebar's categories fold away when you're done cleaning up.

**Mailing lists and labels to write to.** Each address book's mailing lists show under it in the sidebar, as in Thunderbird's Address Book: click one to see everyone in its address book with a checkbox and tick who's on it. Right-click an address book for a new mailing list. Right-click a mailing list or a label for a new message to everyone on it, in To or Bcc (labels sync with your contacts, so they work as mailing lists on every device).

**Chat and OMEMO.** With OMEMO for Thunderbird installed (free, open source), your XMPP chat contacts in Thunderbird get their names from your address book, and you can add people from your address book to the chat list. The ones no card has (they show as an address, like +15551234567@cheogram.com) are listed with Add to a card and New card, so they get a name too. Your chats can be end-to-end encrypted with OMEMO, the encryption Conversations, Cheogram and Gajim use. The Chat page says where to get OMEMO for Thunderbird.

**Undo.** The Changes page lists everything applied, and Undo puts the cards back, deleted ones included. (Deleting a whole address book is the one thing that can't be undone, and it says so before it does it.)

It opens as a tab from its button in Thunderbird's left sidebar, its toolbar button or Tools > Contacts Cleanup, in light or dark (it follows Thunderbird's theme, or pick one).

**What it can access:** your address books, to read cards and change the ones you apply changes to. It makes no network connections and sends nothing anywhere.

Also by Precision Crab: Daynizer, tasks, calendar and contacts with CalDAV and CardDAV sync in Thunderbird (https://addons.thunderbird.net/thunderbird/addon/daynizer/).

Source code (MPL-2.0): https://github.com/precisioncrab/contacts-cleanup

## Details
- Categories: Contacts (and Miscellaneous if a second is wanted).
- License: Mozilla Public License 2.0.
- Support site: https://github.com/precisioncrab/contacts-cleanup/issues
- Homepage: the precisioncrab.com page for it, once it exists (else the GitHub repo).
- Source code upload: not needed. Nothing is minified, bundled or generated; the package is the source.
- Screenshots (made-up cards, 1280x800, taken 2026-10-28 from 0.1.28): `../atn-screenshots/` next to the repo (not in it), 01 to 10: All contacts with the editor and a mailing list in the sidebar (dark), Duplicates (light), the merge page (light), a mailing list's page (dark), right-click a contact (light), Phone numbers (light), Import vCard into a new address book (dark), In several books (light), Missing names (dark), Chat addresses (dark). Captions and alt text: `../website/SCREENSHOTS.md`; the same ten at 2560x1600 for precisioncrab.com in `../website/`.
- Package to upload: `dist/contacts-cleanup-<version>.xpi` (`npm run package`). `web-ext lint`: 0 errors; its warnings are Firefox's checker not knowing Thunderbird's APIs (addressBooks, mailingLists, spaces, windows.openDefaultBrowser).

## Notes for the reviewer
Contacts Cleanup is a Manifest V2 add-on using only the addressBooks, contacts, mailingLists, compose (beginNew only), menus, spaces and storage APIs (V2 because Thunderbird 158's V3 contacts.update and create store every character of the vCard as a custom property on the card; Thunderbird bug 2085594). Changes are written with contacts.update, create and delete ({ vCard }) and mailingLists.create, delete, addMember and removeMember, always after the user clicks Apply, Save, Create, Merge or Delete; each card's previous vCard is kept in storage.local for undo. addressBooks.update and mailingLists.update only rename, after the user picks Rename… and types a name. addressBooks.delete runs only when the user right-clicks an address book (or ticks "then delete" after moving its contacts out) and confirms a dialog saying it can't be undone. compose.beginNew opens a new message (nothing is sent) when the user picks "New message to this list" or "New message to everyone with this label" on a right-click menu; it needs no permission. The Chat page sends runtime.sendMessage to one other add-on (thunderbird-omemo@precisioncrab) if the user has it; nothing else leaves the add-on. No network connections, no remote code; the package is the source (nothing minified or generated).

## Decided (maintainer, 2026-10-27)
- The description names OMEMO for Thunderbird but doesn't link it: the add-on's own Chat page has the links. (OMEMO for Thunderbird is installed from file with signatures off, which a reviewer could object to.)
