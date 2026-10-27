# Manual tests

_What only a person in Thunderbird can check. Use made-up cards in a throwaway address book first; pick only the test books in the sidebar (click one, Ctrl+click another; from 0.1.22) until the test cards behave._

## Quick run before the ATN submission (about 10 minutes, 0.1.24)

Made-up cards only: `docs/test-cards/Demo Contacts.vcf` (12 cards) and `Demo Work.vcf` (6 cards), the same people as the listing's screenshots.

**Set up (once):**
1. Install `contacts-cleanup/dist/contacts-cleanup-0.1.24.xpi` (Add-ons and Themes > gear > Install Add-on From File).
2. Import both files into Thunderbird (Tools > Import > Address Books > vCard file, one file at a time). Each becomes its own address book, named after the file: **Demo Contacts** and **Demo Work**.
3. In Thunderbird's Address Book, select Demo Contacts and make a mailing list **Party** with Jane Doe, Priya Shah and Tom Ashby (New List).

**Run, in Contacts Cleanup:**
1. **Sidebar:** click **Demo Contacts**: its 12 contacts. Ctrl+click **Demo Work**: both books (18). Keep both picked for the rest.
2. **Duplicates:** Jane D and Jane Doe, Bob Miller and Robert Miller, the two Dana Whitfields. Review Jane, Merge, then Undo in the message.
3. **Phone numbers:** numbers in mixed formats. Apply, then Undo.
4. **Missing names:** four (K Nakamura, Marco Alvarez, Riverside Hardware, Sofia Reyes).
5. **In several books:** Owen Clarke (in both books with one contact ID). Click him: the top box names him and says Apply. Separate them, Apply, then Undo. (If he isn't listed, Thunderbird gave the imported copy a new ID: use `Cleanup copies A.vcf` and `B.vcf` as in the 0.1.21 steps.)
6. **Lists to labels > Party (mailing list) > Make a label...:** "Move them into" Demo Work "and delete the list". The three get the label Party, are in Demo Work, and Party is gone. Undo: all back.
7. **Right-click Party** on that page: it asks, Delete; Undo brings it back.
8. **Lists to labels > Demo Work (address book) > Make a label...:** Move them into Demo Contacts, tick "then delete Demo Work, once it's empty". Demo Work is deleted; Undo on that change says it can't be undone and changes nothing.
9. **Clean up:** right-click **Demo Contacts** in the sidebar > it asks > Delete.

**Report:** what didn't match, and any Error Console line that mentions contacts-cleanup.

## 0.1.24: In several books, one contact at a time

From your Daynizer test (2026-10-27). Install `contacts-cleanup/dist/contacts-cleanup-0.1.24.xpi` over 0.1.23.

1. **Clean up > In several books with nothing selected:** the box at the top is for every contact listed ("Apply to N").
2. **Click one contact:** the box now names that contact and its button says "Apply" (just that one); "Or choose for all N at once" goes back. The right-hand panel has the same choice.
3. **Delete Thunderbird's built-in Collected Addresses or Personal Address Book (right-click):** it's refused with a message saying Thunderbird never deletes those two, and nothing changes.

## 0.1.23: move a mailing list's members, delete lists and address books

From your Daynizer test (2026-10-27, the same changes went into Daynizer's copy). Install `contacts-cleanup/dist/contacts-cleanup-0.1.23.xpi` over 0.1.22. Use a test address book with a test mailing list.

1. **Lists to labels > Make a label... on a mailing list.** "Then:" has three choices: leave the members and keep the list; leave them and delete the list (only the list goes); move them into another address book and delete the list. Pick the move: the members get the label, are in the book you picked and not in the old one, and the list is gone. Undo: all back, the list with its members.
2. **Right-click a mailing list** on that page: it asks, then deletes the list; its contacts stay. Undo makes it again with its members.
3. **Make a label... on a whole test address book, "Move them into" another book, and tick "then delete <book>, once it's empty".** The contacts move with the label, the emptied book is deleted. Undo on that change now says it can't be undone (the book is gone) and changes nothing: the moved contacts stay where they are.
4. **Right-click a test address book in the sidebar:** it asks (with how many contacts and mailing lists go with it), then deletes it. Only try this on a test book: Thunderbird should refuse to delete its built-in Personal Address Book and Collected Addresses, but don't test that on yours.

**Report:** what didn't match, and any Error Console line that mentions contacts-cleanup.

## 0.1.22: address books picked like Daynizer's

From your Daynizer test (2026-10-26): the checkboxes beside the address books are gone. Books and labels are picked the way Daynizer's are, and the clean-up tools work on the picked books. The Chat page's Show filter gains "With a chat address". Install `contacts-cleanup/dist/contacts-cleanup-0.1.22.xpi` over 0.1.21. In the 0.1.21 steps below, "check only" a book now means: click it, Ctrl+click the next one.

1. **Click a book** under Address books: Contacts shows only its contacts, the title says "Contacts: <book>", the book is highlighted. A read-only book is greyed out and can't be picked.
2. **Ctrl+click a second book:** both books' contacts, the title names both. Ctrl+click one again: it's taken out.
3. **Click a label:** only contacts with that label. Ctrl+click a book as well: contacts in the book or with the label.
4. **A clean-up page** (Phone numbers, say) with one book picked: a note at the top says "Only <book>, as selected in the sidebar". Ctrl+click another book while on the page: the note names both, and you stay on the page.
5. **Click All contacts:** every contact again, nothing highlighted; the clean-up pages have no note and work on every book.
6. **Chat addresses > Show:** "With a chat address" lists only contacts that have one.

**Report:** what didn't match, and any Error Console line that mentions contacts-cleanup.

## 0.1.21: In several books, and Lists to labels

Test cards first; your real address books stay unchecked in the sidebar until these behave.

1. **Install** `contacts-cleanup/dist/contacts-cleanup-0.1.21.xpi` over 0.1.20 (Add-ons and Themes > gear > Install Add-on From File).
2. **Two books with shared contact IDs.** Import `docs/test-cards/Cleanup copies A.vcf` and `docs/test-cards/Cleanup copies B.vcf` the way step 3 below imports the other test cards (each becomes its own address book, named after the file). Both have Emily Example, Kim Sample and Erin Test with the same contact IDs but slightly different details (B has Emily's JMP.chat address, the numbers written another way, and a note on Erin); B also has Gus Guest. Then, in Thunderbird's Address Book, make a mailing list in "Cleanup copies B" called "Wedding test" with Emily, Kim and Gus (select "Cleanup copies B", New List).
3. **The page.** In Contacts Cleanup's sidebar, check only the two Cleanup copies books. Clean up > **In several books** shows 3. A box says "3 contacts are in both Cleanup copies A and Cleanup copies B", with "Leave as is" picked. Each row says what differs. On All contacts, one copy of each says "also in ...: can't change this copy"; its editor has a "Sort out the copies" link that opens this page on that contact.
4. **Link (Emily).** Select Emily Example. On the right: both copies, which one add-ons can change now, and that the B copy is in Wedding test. What to do: "Link the copies", "Where they differ, use the copy in Cleanup copies B", Apply, read the question, Apply. All contacts: both Emily rows say "linked", neither says "can't change". The A copy now has the JMP.chat address and `+1 555 239 7908`. In Thunderbird's Address Book, Emily is still in Wedding test.
   - Change Emily's phone on one copy, Save: the toast says Edited, and the other copy has the new number too.
   - Check "Save this copy only", change it again, Save: only that copy changed; the notice says the other differs. Click "Make it match this one": both the same again.
   - Unlink: the "linked" tags go.
5. **Keep one (Kim).** Select Kim Sample: "Keep the copy in Cleanup copies A, label it, delete the others". The label box says "Cleanup copies B" and "Also label them with their mailing lists (Wedding test)" is checked. Apply. Kim is only in A, with the labels Cleanup copies B and Wedding test (Labels in the sidebar). Undo in the message: Kim is back in B, and in Wedding test.
6. **Separate (Erin).** Select Erin Test: "Separate them", Apply. Two Erin Test contacts, each with its own details (the B one keeps the note), neither says "can't change". Changes > Undo it.
7. **Leave as is.** In the box: Leave as is (the button says "Leave 2 as is", or 1). The list is empty; "Show the ones left as is" brings them back; select one, "Ask about it again".
8. **Lists to labels, a mailing list.** Clean up > **Lists to labels**: your address books, each with its mailing lists under it. On Wedding test: Make a label..., check "Then delete the mailing list", Make the label. Emily, Kim and Gus have the label Wedding test; Thunderbird's Address Book no longer has the list. Undo in the message: the list is back with its members, and the labels are gone.
9. **Lists to labels, an address book.** On Cleanup copies B: Make a label..., "Move them into Cleanup copies A", Make the label. B is empty; A has everyone once (a contact still shared is combined with A's copy, not doubled), each labeled Cleanup copies B (and Wedding test, for its members). The empty book stays until you delete it in Thunderbird. Undo puts it all back.
10. **Your own books.** Check them again in the sidebar. In several books shows your 56: a box for Synology Contacts and wedding 2 (39) and one for Synology Contacts and Personal Address Book (17). Wedding 2's mailing list Wedding2 holds 34 of the 39. Choose per box or per contact; nothing happens until you click Apply. Kept or linked Synology copies can then be changed everywhere in Contacts Cleanup (Phone numbers puts their numbers in one format, the blue button works on them).

**Report:** what didn't match, and any Error Console line that mentions contacts-cleanup.

## 0.1.20 first run

**Before you start:** Thunderbird must allow unsigned add-ons (Config Editor: `xpinstall.signatures.required` = false), as for OMEMO for Thunderbird. Once the add-on is on addons.thunderbird.net, it's signed and this isn't needed.

1. **Install.** Add-ons and Themes > gear > Install Add-on From File, pick `contacts-cleanup/dist/contacts-cleanup-0.1.20.xpi` (over an older one if you installed it). Thunderbird asks to allow reading and changing your address books. Expect no errors in the Error Console (Ctrl+Shift+J). For the chat list steps, OMEMO for Thunderbird 0.1.6 or later (free) or OMEMO for Thunderbird + Calls 0.3.4 or later.
1b. **Repair first (new in 0.1.16).** With all your address books checked, a bar at the top says how many contacts carry leftover fields from a Thunderbird bug (744 contacts, about 367,000 fields, on 2026-10-21). Click Repair and confirm: it counts up ("Repairing 1 of 744"), then says how many fields it removed, and the bar is gone. Thunderbird then uploads the Google and Synology contacts again (same details); let it finish. Afterwards Contacts Cleanup and Thunderbird should be quick. Changes made from now on add no new leftovers (the add-on is Manifest V2 now).
1c. **Contacts in two address books with one ID (new in 0.1.17).** 56 of your contacts are in Synology and also in wedding 2 or Personal, with the same contact ID. Thunderbird lets add-ons change only one of the two copies (the wedding 2 or Personal one). In Chat addresses and All contacts, the other copy says "same ID as in ..." and its checkbox is off; its editor says why and can't save. On the copy that can be changed, the blue Add JMP.chat address button works: the row and the right panel show the address right away, and the contact stays checked.
1d. **Scrolling (new in 0.1.20).** With all your address books checked, scroll All contacts and Chat addresses with the wheel and with the scroll bar: the list moves as far as the wheel turns, like Thunderbird's own lists and Daynizer's Contacts tab, not several pages at a time. Check a box halfway down: the list stays where it was.
2. **Open it.** Its icon in the left sidebar (under Mail, Address Book, Calendar and the others; hover shows "Contacts Cleanup"). It opens as a tab, on All contacts. Also try the toolbar button and Tools > Contacts Cleanup (press Alt to show the menu bar): each brings up the same tab, never a second one. Restart Thunderbird once: the sidebar icon is still there.
3. **Test address books (imported, nothing to type).** The made-up cards are in `docs/test-cards/`: `Cleanup test.vcf` (17 cards) and `Cleanup test 2.vcf` (1 card). If an older "Cleanup test" book is still there, delete it first. Import each file the same way: Tools > Import (or the ≡ menu > Tools > Import), Import from a file, Import Address Books, "vCard file (.vcf, .vcard)", Continue, pick the file, choose **Create a new directory called "Cleanup test"** (or "Cleanup test 2"; Thunderbird names it after the file), Continue, Start Import, Finish.

   What's in "Cleanup test": Test Person and Test P (same email, Test P has a photo and an organization), a card with only the email `first.last@example.org`, Phone Only (a mobile number), the Roe household (Sam, Sammy, Pat, Patricia, Alex), Harry Example (a UK number), Office Example (a number with an extension), a card with first and last name but no display name (Nora Example), one with only an organization (Example Hardware), one with only `jdoe1987@example.org`, Chat Friend (a chat address already), No Prefix (a chat address without `xmpp:`) and Old Jabber (an old X-JABBER line). "Cleanup test 2" holds a second Test Person.

   Back in Contacts Cleanup (it updates by itself): in the sidebar under Address books, uncheck every book except "Cleanup test" and "Cleanup test 2".
4. **The sidebar.** In Daynizer's order: Contacts, Address books, Labels (once a contact has a label), Clean up, Chat, More. Click a category's name: it folds away (▸); click again: it's back (▾). Fold Clean up, switch pages and restart Thunderbird: it stays folded.
5. **All contacts** (like Daynizer's Contacts tab).
   - **Edit:** select Test Person. The right-hand panel has every field: Address book, Display name, First and Last name, Nickname, Organization, Title, Birthday and Anniversary (with "no year"), Phones and Emails (each with its type), Chat addresses, Addresses, Websites, Labels, Notes. Change the phone number: the button reads Save; click it. The toast says "Edited Test Person"; in Thunderbird's Address Book the number changed and its type didn't. Undo in the toast puts it back.
   - **Edits wait for you:** change something on one contact, select another, come back: your change is still there, not saved. "Undo my edits" drops it.
   - **New contact:** + New contact. Type a first and last name, + Add phone with a number, then "+ JMP.chat address for (the number)", and the label "Friends". Save: the contact shows in the list (selected), Friends appears under Labels in the sidebar, and clicking it shows only that contact. Undo from Changes removes it.
   - **Move:** select Phone Only, set Address book to "Cleanup test 2", Save: it's in the other book now ("Moved Phone Only to Cleanup test 2"). Undo moves it back.
   - **Delete:** select a contact, Delete: gone; Undo in the toast brings it back.
   - **Import vCard…:** pick `docs/test-cards/Cleanup test 2.vcf`, choose "Cleanup test" in the question, Import 1: a second Test Person appears in Cleanup test. Undo takes it out again.
6. **Duplicates.** Test Person and Test P show under Potential duplicates ("same email"). Click Review: both cards are checked. Keep one, change the Name if you like, edit one of the phone numbers (say, the last digit), and use "+ Add an address" to add a made-up address. Click Merge 2 cards. In the Address Book: one card with both numbers (one as you edited it, with its type unchanged), the new address and the organization. Then Undo (the message at the bottom, or Changes): both cards are back as they were.
   - **A group that's several people.** The Roe household (Sam, Sammy, Pat, Patricia, Alex) shows as one group, "may be more than one person". Review: two of them are checked (Sam and Sammy, or Pat and Patricia), the rest not. Rename the merged card (Name, First name), then Merge. The page stays open on the other three: the other pair is checked; Merge again. Then Not duplicates for what's left. Undo from Changes brings the cards back. Open the group again and click Delete on Alex's card: only that card goes, the page stays, and Undo in the message brings it back.
   - **Photos.** "Test P" came in with a photo (a teal circle). In Contacts Cleanup it shows in place of the initials. Review the Test Person group: step 3 has a Photo choice; keep Test Person (no photo), pick Test P's photo, and Merge. The merged card has that photo. Undo brings both cards back, Test P with its photo.
   - **Address books.** The Test Person in "Cleanup test 2" doesn't join the Test Person group: the same person in two address books isn't a duplicate. Check "Also match cards in different address books" at the top of Duplicates: now it does (3 cards). Uncheck it again.
7. **Phone numbers.** The numbers show as `+1 555 ...`; Harry Example's UK number as `+44 20 7946 0958` (the `(0)` dropped, your grouping kept). Office Example's `555-444-1212 x123` is listed as having an extension and left alone. Select a row: the editor is on the right, with what's proposed above it. Apply in the bar. Open a card in the Address Book: the number changed, its type (mobile, work) didn't. Undo from Changes.
8. **Missing names.** Offered: "First Last" (from the email), "Nora Example" (from her first and last name), "Example Hardware" (from the organization), all checked; "Jdoe1987" (a one-word email guess) starts unchecked. Select a row: the editor is on the right with the proposed name above it, so you can see who it is and fill in more. Apply in the bar; check the cards' display names.
9. **Chat addresses, Contacts tab** (Chat in the sidebar).
   - **Fixes:** a bar at the top says 2 contacts have chat addresses Thunderbird can't use. Show lists them (No Prefix, Old Jabber); Fix all 2: No Prefix gets `xmpp:noprefix@example.org` and Old Jabber `xmpp:old.jabber@example.org`, and No Prefix saves in the Address Book without a red field.
   - **The list:** every contact with a phone number or chat address: their chat address, or "number → JMP.chat address" with "no chat address yet", and "in chat list" when they are.
   - **JMP.chat addresses:** check Harry Example and Office Example (or Select all): a bar under the list says how many are checked, with Add JMP.chat addresses and Add to chat list. Add JMP.chat addresses: both cards get theirs. Undo from the toast.
   - **One person:** select a contact: the editor is on the right; "+ JMP.chat address for (number)" there, Save.
9b. **Google Contacts (your real books, new in 0.1.15).** With your Google address book checked: the card Google turned into three `x-apple:` copies shows "to fix" on the Contacts tab and isn't offered a JMP.chat address again. Fix all: it has one `xmpp:` address, written `IMPP;X-SERVICE-TYPE=Jabber:xmpp:...`. After Thunderbird's next sync with Google (or File > Synchronize), it should still be `xmpp:` (Google keeps it as Jabber now). Then add a JMP.chat address to another Google contact with the bar's button: after a sync it should stay `xmpp:` too. Clicks and checkboxes should feel instant now, even with all your books checked.
10. **Chat lists, one per XMPP account** (needs OMEMO for Thunderbird 0.1.6 or later, free or + Calls; new in 0.1.19). Best with two XMPP accounts in Thunderbird's chat.
   - **Which account each person is on:** on the Contacts tab, each person on a chat list has a tag per account (the part of the address before the @). The filter at the top has "On (account)'s chat list" for each account: pick one, and only its people show.
   - **Add to a chat list:** check one real person you'd like to text from Thunderbird (or a test card, and take it off again afterwards). The bar has one "Add to (account)" button per account. Click one: it asks first; then they show in that account's chat list in Thunderbird with the name from their card (and on your phone's chat app for that account, since the list is on the server), and the row gets that account's tag. A card with no chat address gets the JMP.chat address it was added with.
   - **The editor's checkboxes:** select that contact: under each chat address, "In the chat list of:" has a checkbox per account, checked for the account you added them to. Uncheck it and Save: they're off that account's chat list, and still on the other's if they were there. Check the other account's box and Save: they're added there too.
   - **Chat list tab:** one section per account, each headed with its name, address and how many chat contacts it has, all shown at once. Each has "Names from your address book" (keep In Thunderbird only). Under "In your address book", each chat contact shows by its name, with the number under it. Under No name yet: your chat contacts no card has. On one that's a phone number, New card, type a name, Create card: within a few seconds it moves to "In your address book" and Thunderbird's chat list shows the name. On another, Add to a card: search a card, Add this number. Undo takes either back.
11. **The OMEMO button** (under Chat in the sidebar): with OMEMO Pro, OMEMO settings; with OMEMO for Thunderbird (free), Get OMEMO Pro (calls); with neither, Get OMEMO for Thunderbird, and the Chat addresses page offers it too. Each opens its Gumroad page in your web browser.
12. **Theme.** View > Theme: Light Mode, Dark Mode, Match System. With Match System, switch Thunderbird between its light and dark theme (Add-ons and Themes > Themes): the tab follows.
13. **Optional, real address books.** Check them again in the sidebar and look through the proposals without applying anything. Note any duplicate group that isn't one person, and any number that would come out wrong.

**Report:** what didn't match, and any Error Console line that mentions contacts-cleanup.
