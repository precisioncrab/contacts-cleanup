# Contacts Cleanup

A free Thunderbird add-on that tidies your address book and gets your contacts ready for chat:

- **Duplicates:** finds cards that look like the same person (same email address, phone number in any format, chat address, or name), across address books, and merges them. A group can hold several people (a family sharing a home number), so you sort its cards into people first; it starts you off from the strongest matches and shows what each card shares with whom. Each person's cards merge into one, and different people won't show as duplicates of each other again. For each merge you pick the card to keep and what it keeps; every value starts checked, so nothing is lost unless you uncheck it.
- **Phone numbers:** puts every number in one format (`+1 555 123 4567`, or compact `+15551234567`). Numbers without a country code are read as US and Canada by default, or another country you pick.
- **Missing names:** gives cards without a display name one, from the first and last name, the organization, the nickname or the email address. You can change each before applying.
- **Chat addresses:** adds XMPP chat addresses to cards, written the way Thunderbird's card editor wants them (`xmpp:` in front). A checkbox per phone contact for its JMP.chat address (`xmpp:+15551234567@cheogram.com`, for texting and calling phone numbers from an XMPP account registered with JMP.chat), "Select all phone contacts", or "Generate JMP.chat address" for one person. Also fixes chat addresses other apps saved without `xmpp:` or in an X-JABBER field.
- **Chat contacts:** with [OMEMO for Thunderbird](https://github.com/precisioncrab/thunderbird-omemo) installed, names your XMPP chat contacts in Thunderbird from your address book, and you can chat with them end-to-end encrypted with OMEMO.

Nothing changes until you look at a proposed change and apply it, and every applied change can be undone (the Changes page, or Edit > Undo last change). Undo brings deleted cards back with their photos.

It opens as a tab, from its toolbar button or Tools > Contacts Cleanup, in Thunderbird's light or dark theme (View > Theme).

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
