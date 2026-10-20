# Manual tests

_What only a person in Thunderbird can check. Use made-up cards in a throwaway address book first; the real address books can stay unchecked in the sidebar until the test cards behave._

## 0.1.0 first run

**Before you start:** Thunderbird must allow unsigned add-ons (Config Editor: `xpinstall.signatures.required` = false), as for OMEMO for Thunderbird. Once the add-on is on addons.thunderbird.net, it's signed and this isn't needed.

1. **Install.** Add-ons and Themes > gear > Install Add-on From File, pick `contacts-cleanup/dist/contacts-cleanup-0.1.0.xpi`. Thunderbird asks to allow reading and changing your address books. Expect no errors in the Error Console (Ctrl+Shift+J).
2. **Open it.** The Contacts Cleanup toolbar button, or Tools > Contacts Cleanup (press Alt to show the menu bar). It opens as a tab. Click the button again: the same tab comes to the front, no second tab.
3. **Test address book.** In the Address Book: New Address Book, "Cleanup test". Add, with made-up details:
   - "Test Person": email `test.person@example.org`, mobile `(555) 123-4567`
   - "Test P": email `test.person@example.org`, work `555.987.6543`, organization "Example Co"
   - a card with only the email `first.last@example.org` (no names)
   - "Phone Only": mobile `555 222 3333`

   Back in Contacts Cleanup (it updates by itself): in the sidebar under Address books, uncheck every book except "Cleanup test".
4. **Duplicates.** Test Person and Test P show as one group ("same email"). Review and merge: both numbers, the email, Example Co are listed. Merge into one. In the Address Book: one card with both numbers and the organization. Then Undo (the message at the bottom, or Changes): both cards are back as they were.
5. **Phone numbers.** The numbers show as `+1 555 ...`. Apply. Open a card in the Address Book: the number changed, its type (mobile, work) didn't. Undo from Changes.
6. **Missing names.** The email-only card is offered "First Last". Change it if you like, Apply, check the card's display name.
7. **Chat addresses.** Select "Phone Only", then Generate JMP.chat address. Open the card in the Address Book: its chat address is `xmpp:+15552223333@cheogram.com`, and the card can be edited and saved (no red field). Back in Contacts Cleanup, uncheck it and Apply: the address is gone.
8. **Theme.** View > Theme: Light Mode, Dark Mode, Match System. With Match System, switch Thunderbird between its light and dark theme (Add-ons and Themes > Themes): the tab follows.
9. **Chat contacts.** With your current OMEMO add-on (0.1.4 or Pro), expect the "Get OMEMO for Thunderbird" page: that version doesn't answer other add-ons yet. The real test comes with OMEMO free 0.1.5 and the next Pro build.
10. **Optional, real address books.** Check them again in the sidebar and look through the proposals without applying anything. Note any duplicate group that isn't one person, and any number that would come out wrong.

**Report:** what didn't match, and any Error Console line that mentions contacts-cleanup.
