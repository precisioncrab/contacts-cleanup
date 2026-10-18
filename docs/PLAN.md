# Plan

_Created 2026-10-18._

## Goal
A free add-on on addons.thunderbird.net (ATN) that cleans up Thunderbird's address book and adds chat addresses to contact cards. It also helps people find OMEMO for Thunderbird Chat, which ATN can't list: that add-on needs a WebExtension Experiment (Thunderbird has no official API for its chat), and ATN rejects add-ons with Experiments.

## Rules
- Official Thunderbird WebExtension APIs only, never an Experiment.
- The user sees every change before it happens, and every applied change can be undone.
- MPL-2.0, no copyleft code.

## Features
1. **Duplicates:** cards that look like the same person (same email, phone number or XMPP address; similar names), across all address books. Proposes a merge that keeps every field; the user picks.
2. **Phone numbers:** one format (international, `+1 555 123 4567`), with a default country for numbers without a country code (10-digit numbers read as US/Canada by default).
3. **Missing names:** a display name from the first and last name, or from the email address.
4. **Chat addresses:** XMPP addresses in the card's IMPP field (`xmpp:name@example.org`), and Cheogram addresses for phone numbers (`xmpp:+15551234567@cheogram.com`), which let XMPP apps text and call phone numbers.
5. **Chat contacts:** with OMEMO for Thunderbird Chat installed, a tab asks it (cross-add-on messaging) to name the chat contacts from the address book, and, with OMEMO Pro, to group them by account. Without it, the tab says what it would do and links to it.

## Listing
- Name: Contacts Cleanup.
- Summary: mentions XMPP (the add-on manages XMPP addresses).
- Description: what it does, and that it gets contacts ready for encrypted chat with OMEMO for Thunderbird Chat. Links to OMEMO for Thunderbird Chat and to Daynizer.
- Accurate wording only.

## Open
- Manifest version and the address book API details across Thunderbird 128 ESR to current.
- How cards store IMPP and phone fields (vCard in the contacts API) and how to edit them without losing other fields.
- The message format for the chat contacts tab (decided in the OMEMO add-on, which runs the cleanup).
