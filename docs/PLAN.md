# Plan

_Created 2026-10-18. Chat addresses and the split with the OMEMO add-on and Daynizer decided 2026-10-19._

## Goal
A free add-on on addons.thunderbird.net (ATN) that cleans up Thunderbird's address book and adds chat addresses to contact cards. It also helps people find OMEMO for Thunderbird, which ATN can't list: that add-on needs a WebExtension Experiment (Thunderbird has no official API for its chat), and ATN rejects add-ons with Experiments.

Kept separate from Daynizer's add-on (decided 2026-10-19): its own ATN listing is how people find it, it works on Thunderbird's own address book (Daynizer's add-on keeps its own CardDAV contacts), and a small free add-on is easier to trust. Daynizer gets the chat address features in its own screens.

## Rules
- Official Thunderbird WebExtension APIs only, never an Experiment.
- The user sees every change before it happens, and every applied change can be undone.
- MPL-2.0, no copyleft code.

## Where it runs
Its own tab, opened from a toolbar button or the Tools menu. The official API can't add anything inside the address book itself: no right-click on cards and no button in the address book's toolbar (checked in Thunderbird 158's API schemas, 2026-10-19: the menu contexts are mail, compose, folders, tabs and the Tools menu; toolbar buttons go on the main or tabs toolbar). Buttons in this tab do what a right-click would.

## Features
1. **Duplicates:** cards that look like the same person (same email, phone number or XMPP address; similar names), across all address books. Proposes a merge that keeps every field; the user picks.
2. **Phone numbers:** one format (international, `+1 555 123 4567`), with a default country for numbers without a country code (10-digit numbers read as US/Canada by default).
3. **Missing names:** a display name from the first and last name, or from the email address.
4. **Chat addresses:** XMPP addresses in the card's IMPP field, always written with the `xmpp:` prefix (Thunderbird's own card editor refuses an address without it, which trips people up).
   - **JMP.chat addresses from phone numbers:** `xmpp:+15551234567@cheogram.com`, which let an XMPP account registered with JMP.chat text and call that phone number.
   - **A list with a checkbox per contact:** every contact with a phone number, checked if it already has a chat address. "Select all phone contacts" for a batch; or a few people only.
   - **One person:** search for them, then a "Generate JMP.chat address" button. This is the "I want to text someone who isn't in my chat list yet" path.
   - A contact with several phone numbers: the mobile number by default, with a choice.
   - Gateway: JMP.chat (`cheogram.com`) by default; another gateway's domain can be typed in.
   - Unchecking removes only a chat address this add-on generated.
   - Phone number rules match the OMEMO add-on's (`thunderbird-omemo/src/contacts/cards.js`): any format, 10 digits read as +1, `00` as international.
5. **Chat contacts:** a card with a chat address becomes a chat contact in Thunderbird's chat list through OMEMO for Thunderbird (the add-on with the Experiment). Its per-account choice is Off, Thunderbird only, or also on the XMPP server. This add-on's "Chat contacts" tab asks it to run (cross-add-on messaging); without it, the tab explains what it would do and links to it. With OMEMO Pro, chat contacts are also grouped by account.

## Help text (needed on the Chat addresses and Chat contacts tabs)
Plain explanations of what each choice means, since there are two different servers involved:
- **Chat address on a card:** saved with the contact, like an email address. It goes wherever that address book syncs (your CardDAV server, then your phone and other apps), or nowhere for a local address book. On its own it doesn't add anyone to a chat list.
- **JMP.chat address:** a phone number at `cheogram.com`. It only works if your XMPP account is registered with JMP.chat (or uses another Cheogram gateway); then texts and calls to it reach that phone number as SMS and phone calls.
- **Chat contact, Thunderbird only:** the person shows in Thunderbird's chat list. Your XMPP server and your other chat apps don't see it.
- **Chat contact, also on your XMPP server:** added to your account's contact list on your XMPP server, so every chat app signed in to that account shows it too.
- What happens when a chat address or a chat contact is removed.

## Listing
- Name: Contacts Cleanup.
- Summary: mentions XMPP (the add-on manages XMPP addresses).
- Description: what it does, and that it gets contacts ready for encrypted chat with OMEMO for Thunderbird. Links to OMEMO for Thunderbird and to Daynizer.
- Accurate wording only.

## Open
- Manifest version and the address book API details across Thunderbird 128 ESR to current (Thunderbird 158's API has `contacts.update` with a vCard).
- How to edit a card's vCard without losing other fields.
- The message format for the chat contacts tab. The OMEMO add-on's background already answers `chatNames.preview` and `chatNames.apply` from its own options page; an `onMessageExternal` listener there, allowing only this add-on's id, comes with this tab.
