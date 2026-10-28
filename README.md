# Contacts Cleanup

A free Thunderbird add-on to manage your contacts, tidy your address book and get your contacts ready for chat. Its sidebar has Contacts, Clean up, Chat, More and Address books, and each category folds away once you're done with it.

- **All contacts:** every contact, or those in the address books and labels you pick in the sidebar (click one, Ctrl+click for more; the clean-up tools then work on the picked address books), like the Contacts tab of [Daynizer](https://addons.thunderbird.net/en-US/thunderbird/addon/daynizer/): search, + New contact, Import vCard, and the selected contact's editor on the right (every field: names, organization, title, birthday and anniversary with or without a year, phones and emails with their types, chat addresses, addresses, websites, labels, notes; move to another address book; Delete). Labels show under Contacts in the sidebar.
- **Duplicates:** lists potential duplicates: cards in the same address book with the same email address, phone number in any format, chat address, or name (the same person in two address books isn't a duplicate, unless you ask it to compare across address books). Review one: check the cards that are the same person (the ones that look most alike start checked), pick the card to keep, choose what the merged card has (every detail can be edited; pick which photo it keeps; everything starts checked, so nothing is lost unless you uncheck it), and click Merge. Delete on a card removes just that card. "Not duplicates" hides a group for good.
- **In several books:** contacts that are in more than one address book with the same contact ID (often from importing one address book into another). Thunderbird lets add-ons change only one of those copies, so you choose what happens to them, for one contact or for every contact in the same two address books at once: leave them as they are; link the copies (each gets its own ID and stays in its address book and mailing lists, they get the same details, and an edit you make in Contacts Cleanup to one is made to the others; the links are kept in Contacts Cleanup only); keep one copy (it gets the others' details, and their address books and mailing lists become labels on it); or separate them into two contacts.
- **Mailing lists:** each address book's mailing lists show under it in the sidebar, as in Thunderbird's Address Book; click one to see its members. Right-click an address book for New mailing list…, and tick lists under Mailing lists in a contact's editor (Thunderbird only puts contacts with an email address on a list, and only contacts of the list's own address book). Right-click a list for a new message to it, Rename…, Make a label… or Delete; right-click a label for a new message to everyone with it (in To or Bcc).
- **Lists to labels:** makes an address book or a mailing list a label on its contacts. A label stays with a contact and syncs with it (Google, CardDAV; phones show labels as groups). An address book's contacts can then stay where they are or move into another address book (a contact that's already there with the same ID is combined with that copy, not copied twice); a mailing list can be deleted afterwards.
- **Phone numbers:** puts every number in one format (`+1 555 123 4567`, or compact `+15551234567`). Numbers without a country code are read as US and Canada by default, or another country you pick.
- **Missing names:** gives cards without a display name one, from the first and last name, the organization, the nickname or the email address. You can change each before applying, and the editor on the right shows the whole card.
- **Chat addresses** (all free), in two tabs:
  - **Contacts:** everyone with a phone number or chat address: their chat address, or the JMP.chat address their number makes (`xmpp:+15551234567@cheogram.com`, for texting and calling phone numbers from an XMPP account registered with JMP.chat). Check people (or Select all) to add JMP.chat addresses to their cards, or to add them to Thunderbird's chat list. The editor has "+ JMP.chat address" and an "In chat list" checkbox. Chat addresses other apps saved without `xmpp:` (Thunderbird's card editor refuses them) or in an X-JABBER field are fixed from here.
  - **Chat list:** with [OMEMO for Thunderbird](https://precisioncrab.gumroad.com/l/omemo) installed (free; the page and the sidebar link to it until it is), your XMPP chat list next to your address book. Chat contacts get their names from your cards; the ones no card has are listed with "Add to a card" and "New card", so they get a name too.

  Saved on a card, a chat address goes wherever the address book syncs, where chat apps like Conversations and Cheogram can show the card's name and photo for it. OMEMO for Thunderbird also encrypts your chats end to end; [OMEMO for Thunderbird + Calls](https://precisioncrab.gumroad.com/l/omemo-pro) adds audio calls.

Contacts show with their photos. Nothing changes until you look at a proposed change and apply it, and every applied change can be undone (the Changes page, or Edit > Undo last change). Undo brings deleted cards back with their photos.

It opens as a tab, from its button in Thunderbird's left sidebar (next to Mail, Address Book and Calendar), its toolbar button, or Tools > Contacts Cleanup, in Thunderbird's light or dark theme (View > Theme).

## What it can access

- **Your address books** (the `addressBooks` permission), to read cards and mailing lists and to change the ones you apply changes to. Read-only address books are left alone, and you can leave any address book out.
- **New messages:** "New message to…" opens Thunderbird's compose window with the recipients filled in (it needs no permission and sends nothing itself).
- **Nothing else.** It makes no network connections. Its settings and the undo history stay in Thunderbird's add-on storage. It uses only Thunderbird's official add-on APIs (no Experiment).
- The only other add-on it talks to is OMEMO for Thunderbird, if installed, from the Chat page.

## Requirements

Thunderbird 128 or later.

## Development

No dependencies and no build step: the package is the source.

```
npm test          # Node 22 or later
npm run package   # writes dist/contacts-cleanup-<version>.xpi
```

Layout: `src/core/` is the logic (vCard editing, phone numbers, duplicates and merging, chat addresses, undo), tested in `test/`; `src/ui/` is the tab (plain DOM, Daynizer's look); `src/lib/` talks to Thunderbird and to OMEMO for Thunderbird. Plan and state: [docs/PLAN.md](docs/PLAN.md), [docs/STATUS.md](docs/STATUS.md).

## License

[MPL-2.0](LICENSE), with no copyleft code.
