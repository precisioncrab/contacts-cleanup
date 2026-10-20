# Contacts Cleanup

A free Thunderbird add-on that tidies your address book and gets your contacts ready for chat:

- **Duplicates:** lists potential duplicates: cards in the same address book with the same email address, phone number in any format, chat address, or name (the same person in two address books isn't a duplicate, unless you ask it to compare across address books). Review one: check the cards that are the same person (the ones that look most alike start checked), pick the card to keep, choose what the merged card has (every detail can be edited: rename it, fix a phone number or an address, or add one; pick which photo it keeps; everything starts checked, so nothing is lost unless you uncheck it), and click Merge. Cards you leave unchecked stay as they are, and Delete on a card removes just that card. "Not duplicates" hides a group for good.
- **Phone numbers:** puts every number in one format (`+1 555 123 4567`, or compact `+15551234567`). Numbers without a country code are read as US and Canada by default, or another country you pick.
- **Missing names:** gives cards without a display name one, from the first and last name, the organization, the nickname or the email address. You can change each before applying.
- **Chat addresses:** adds XMPP chat addresses to cards, written the way Thunderbird's card editor wants them (`xmpp:` in front). A checkbox per phone contact for its JMP.chat address (`xmpp:+15551234567@cheogram.com`, for texting and calling phone numbers from an XMPP account registered with JMP.chat), "Select all phone contacts", or "Generate JMP.chat address" for one person. Also fixes chat addresses other apps saved without `xmpp:` or in an X-JABBER field.
- **Chat contacts:** with [OMEMO for Thunderbird](https://github.com/precisioncrab/thunderbird-omemo) installed (the Chat pages and the sidebar link to it until it is), names your XMPP chat contacts in Thunderbird from your address book, and you can chat with them end-to-end encrypted with OMEMO.

Contacts show with their photos. Nothing changes until you look at a proposed change and apply it, and every applied change can be undone (the Changes page, or Edit > Undo last change). Undo brings deleted cards back with their photos.

It opens as a tab, from its button in Thunderbird's left sidebar (next to Mail, Address Book and Calendar), its toolbar button, or Tools > Contacts Cleanup, in Thunderbird's light or dark theme (View > Theme).

## What it can access

- **Your address books** (the `addressBooks` permission), to read cards and to change the ones you apply changes to. Read-only address books are left alone, and you can leave any address book out.
- **Nothing else.** It makes no network connections. Its settings and the undo history stay in Thunderbird's add-on storage. It uses only Thunderbird's official add-on APIs (no Experiment).
- The only other add-on it talks to is OMEMO for Thunderbird, if installed, from the Chat contacts page.

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
