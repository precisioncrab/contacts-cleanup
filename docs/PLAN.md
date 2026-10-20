# Plan

_Created 2026-10-18. Chat addresses and the split with the OMEMO add-on and Daynizer decided 2026-10-19. First build 2026-10-20: the open questions are answered under "How it's built"._

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
1. **Duplicates:** cards that look like the same person (same email, phone number or XMPP address; similar names), across all address books. Proposes a merge that keeps every field; the user picks. **A group can be several people (added 2026-10-20 at the maintainer's request):** matches chain (a shared home number, a shared name), so a group of 10 cards can be 2 or 3 people. **0.1.2 (the maintainer couldn't tell what 0.1.1 did: it looked the same as before):** the group page shows one column per person, named by the person's fullest name, a sentence on top saying what it found and what to do, numbered steps (1. Who is who, 2. Merge each person), and a Move to menu on each card; the list says "looks like 1 person" or "looks like N people" and offers Sort and merge for any group of 3 or more. The pre-sort joins the strongest links first and never joins two sets of cards whose names clash, so a card with no name can't glue two people together. **Address books (0.1.2, the maintainer):** only cards in the same address book are compared, as Google Contacts (no merging across accounts) and Apple Contacts (cards in different accounts are linked, not merged) do; a checkbox on the Duplicates page compares across address books too. 0.1.1's design: each card gets a person picker, pre-sorted from the strong matches only (same email or chat address, or same phone with a matching given name, or the same full name; a shared number with different given names, a shared family name or a one-word name alone isn't enough), with what each card shares and with whom. Each person with two or more cards gets its own merge editor (tabs); a person with one card is left alone. Apply merges every person and marks the people apart ("not duplicates"), as one change; Undo also lets them group again. A checkbox per card in a merge leaves it out (it becomes its own person). Researched first: Outlook on the web (all suggested contacts checked, uncheck the ones not to merge), Google Contacts (accept suggestions one by one, or pick contacts by hand), Apple Contacts (all or nothing, or Merge Selected Cards), Salesforce (up to 3 records per merge, chosen from the duplicate set), Duplicate Contacts Manager (pairs only).
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
5. **Chat contacts:** through OMEMO for Thunderbird (the add-on with the Experiment). Free: chat contacts get their names from the address book. OMEMO Pro: a card with a chat address becomes a chat contact in Thunderbird's chat list (per account Off, Thunderbird only, or also on the XMPP server), and chat contacts are grouped by account. This add-on's "Chat contacts" tab asks it to run (cross-add-on messaging); without it, the tab explains what it would do and links to it. Without Pro, a chat address on a card still lets the user add the person by hand with Thunderbird's Add Contact.

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

## How it's built (2026-10-20)
- **Manifest V3, Thunderbird 128 and later.** Checked in Thunderbird 158's own schemas: in MV3 the card API is `addressBooks.contacts`, and `update(id, vCard)` and `create(parentId, vCard)` take vCard text; a card node carries `vCard`. Permissions: `addressBooks`, `menus` (Tools > Contacts Cleanup), `storage`. No host permissions, no network.
- **Editing a card without losing fields:** Thunderbird replaces a card's whole vCard on update, so the add-on never rebuilds a card from a model. It edits the vCard line by line (`src/core/vcard.js`): untouched lines go back byte for byte (photos, custom fields, Apple's grouped labels), and a changed value keeps its line's parameters (type, PREF) as written.
- **Merging:** the kept card is edited; the others are deleted. Values from the other cards are added without their group (an Apple `item1.` label would point nowhere) and without PREF (the kept card's preferred values stay preferred). Fields only the other cards hold are added; categories are joined. The default kept card is one with a photo, else the one with the most fields; the default name is the fullest one.
- **Undo:** each applied change is a history entry with every card's vCard before and after (read back from Thunderbird), and a deleted card's photo. Undo checks nothing changed since (REV and PRODID aside, so a sync doesn't count) and asks before overwriting. Deleted cards come back with their old UID, so they keep their id. The last 50 changes are kept.
- **Phone format:** US and Canada numbers are always `+1 555 123 4567`. Other countries' numbers keep the digit grouping the user typed (each country groups its own way); one written as a single block gets a simple grouping. The compact format is plain +E.164. Numbers with an extension, or without a country code when none is picked, are left alone and listed.
- **Generated chat addresses** are tracked per card id (`generated` in storage), so only those are ever removed; undo keeps that record in step.
- **UI:** plain DOM, no framework and no build step, so the package is the source ATN reviews. Daynizer's color tokens (dark and light), sidebar, toolbar, rows, detail panel and menu bar; View > Theme with Match System (follows Thunderbird's theme), Light Mode and Dark Mode, as in Daynizer.
- **Chat contacts protocol (OMEMO for Thunderbird's `runtime.onMessageExternal`, answering only `contacts-cleanup@precisioncrab`):** `hello` -> `{ name, version, pro, protocol: 1 }`; `chatNames.preview` -> the same result its options page shows; `chatNames.setMode { jid, mode }` saves the account's choice (`off`, `local`, `server`) and writes; `openOptions { section }`. Without an answer (not installed, turned off, or older than 0.1.5) the tab explains and links to it. Telling those apart would need the `management` permission, which isn't worth asking for.
