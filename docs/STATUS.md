# Status

_Current state and log, newest on top. The plan is `docs/PLAN.md`; the checks only a person in Thunderbird can do are `docs/MANUAL-TESTS.md`; the ATN listing text is `docs/LISTING.md`._

## Current state (2026-10-20)

**Test build 0.1.1, not yet run in Thunderbird.** All five features are built (`dist/contacts-cleanup-0.1.1.xpi`, from `npm run package`):

| Area | State |
|---|---|
| Duplicates and merging (`src/core/duplicates.js`, Duplicates page and the sort-and-merge page) | Built and tested (Node, and clicked through in a browser with a fake address book); 0.1.1 sorts a group into people |
| Phone numbers in one format (`src/core/phone.js`, `fixes.js`) | Built and tested |
| Missing names (`src/core/fixes.js`) | Built and tested |
| Chat addresses: JMP.chat per phone contact, select all, one person, prefix fixes (`src/core/chat.js`) | Built and tested |
| Chat contacts through OMEMO for Thunderbird (`src/lib/omemo.js`) | Built; the OMEMO side (`onMessageExternal`) is in the public OMEMO repo, not in a release yet (free 0.1.5, then Pro) |
| Undo for every change (`src/core/history.js`, Changes page) | Built and tested |
| Light and dark theme, Daynizer's look (`src/ui/`) | Built; both themes checked in screenshots |
| ATN listing text (`docs/LISTING.md`) | Drafted |

**Tests:** `npm test` gives 63 passing (Node 22+). The UI was also driven in headless Edge against a fake Thunderbird API (merge, undo, phone fixes, names, JMP.chat address, OMEMO messages, theme switch): no page errors. That harness isn't in the repo.

**Checked against Thunderbird 158's own API schemas (2026-10-20):** `addressBooks.contacts` with `update(id, vCard)` and `create(parentId, vCard)` taking vCard text in MV3, `ContactNode.vCard`, `action`, the `tools_menu` menu context, `windows.openDefaultBrowser`.

## Next steps

1. **The maintainer: run `docs/MANUAL-TESTS.md`** in Thunderbird (a throwaway address book first).
2. OMEMO for Thunderbird: release the `onMessageExternal` listener (free 0.1.5, then merged into Pro), then test the Chat contacts page with it.
3. ATN: screenshots, then submit with `docs/LISTING.md`. Check the open question there about linking to an add-on that's installed from file.
4. Later: Cheogram group texts (`+1...,+1...@cheogram.com`) and chat contacts from cards come from the OMEMO side (Pro).

## Log

### 2026-10-20
- **Test build 0.1.1: a duplicate group can be several people** (the maintainer: 10 cards that are 2 or 3 real people couldn't be merged as 2 or 3). Matches chain, so a household's shared number and a shared name put several people in one group. Looked first at how others do it: Outlook on the web lists the suggested contacts all checked and you uncheck the ones not to merge; Google Contacts takes suggestions one by one or contacts you pick; Apple Contacts is all or nothing unless you select cards; Salesforce merges up to 3 records chosen from the duplicate set; Duplicate Contacts Manager works in pairs. Built: `groupLinks` (what each pair of cards shares), `namesCompatible` (given names where one starts the other: Sam and Sammy, J and Jane; a shared family name alone doesn't count), `strongLink` and `suggestPeople` (people from strong links only), `apartPairs`. The group page ("Sort and merge") gives each card a person picker (Person 1, 2, ..., New person), pre-sorted, with what each card shares and with whom; each person with two or more cards gets a merge editor tab; a checkbox per card in a merge leaves it out. Apply merges every person and marks the people apart, as one history entry; Undo restores the cards and lets them group again (the kept-apart pairs are stored on the entry). The list says "looks like N people" and offers Sort and merge. 4 new tests (63); driven in headless Edge with a 7-card household (3 people): sorted right, merged, kept apart, undone, no page errors.
- **First build: test build 0.1.0.** Manifest V3 for Thunderbird 128 and later, official APIs only (`addressBooks`, `menus`, `storage`; no Experiment, no host permissions). Opens as a tab from its toolbar button or Tools > Contacts Cleanup (an open tab comes to the front, found by messaging it, so no `tabs` permission). Pages: Duplicates (groups by email, phone in any format, chat address or name; merge page with the card to keep, every value checked, single fields picked, notes added; "Not duplicates" remembered), Phone numbers (international or compact; default country for numbers without a code; the user's own grouping kept outside US and Canada; extensions and unknown numbers listed, left alone), Missing names (from N, organization, nickname or email; editable; one-word email guesses start unchecked), Chat addresses (checkbox per phone contact for its JMP.chat address, mobile number first with a choice, gateway field, Select all phone contacts, Generate JMP.chat address for one person, only its own addresses ever removed; a second tab fixes addresses without `xmpp:` and X-JABBER fields), Chat contacts (asks OMEMO for Thunderbird for each account's names and mode, or explains and links to it), Changes (undo any change; a card changed since asks first) and About. Help text from the plan on the chat pages. Cards are edited line by line, so untouched vCard lines come back byte for byte. Look and theme follow Daynizer: its color tokens, sidebar, toolbar, rows, detail panel and Edit/View/Help menu bar, and View > Theme (Match System, Light Mode, Dark Mode). 59 tests.
- The OMEMO side: OMEMO for Thunderbird's background answers this add-on's id over `runtime.onMessageExternal` (`hello`, `chatNames.preview`, `chatNames.setMode`, `openOptions`); in the public OMEMO repo with 6 tests.

### 2026-10-18
- Project started: name, license (MPL-2.0), public repo and plan.
