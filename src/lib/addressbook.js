/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Thunderbird's address books, through the official API only, as a
 * Manifest V2 add-on (browser.contacts). The `api` object is what
 * src/core/history.js expects.
 *
 * Why Manifest V2: in Thunderbird 158 (ext-addressBook.js), the Manifest V3
 * contacts.update(id, vCard) and contacts.create(parentId, vCard) pass the
 * vCard text on to addProperties(), which stores every character of it as a
 * custom property named "0", "1", "2", ... on the card. Contacts Cleanup
 * 0.1.0 to 0.1.15 were V3, and a card with a photo collected tens of
 * thousands of them, which made everything slow. In Manifest V2 the vCard
 * goes in as { vCard }, a property Thunderbird keeps out, so nothing extra
 * is stored; and an update can clear those leftover properties (repair).
 */

const contacts = () => browser.contacts ?? browser.addressBooks.contacts;

/** A property Thunderbird stored from one character of a vCard (the bug above): a name that's only digits. */
export const isJunkProperty = (name) => /^\d+$/.test(name);

/** A contact node as the rest of the add-on uses it: { id, parentId, readOnly, vCard, junk } (junk: how many leftover properties). */
function contactOf(node) {
  const properties = node.properties ?? {};
  return {
    id: node.id,
    parentId: node.parentId,
    type: node.type,
    readOnly: Boolean(node.readOnly),
    vCard: node.vCard ?? properties.vCard,
    junk: Object.keys(properties).filter(isJunkProperty).length,
  };
}

/** Every address book with its cards: [{ id, name, readOnly, remote, contacts: [contact] }]. */
export async function loadBooks() {
  const books = await browser.addressBooks.list(true);
  return books.map((book) => ({
    id: book.id,
    name: book.name,
    readOnly: Boolean(book.readOnly),
    remote: Boolean(book.remote),
    contacts: (book.contacts ?? []).map(contactOf).filter((c) => typeof c.vCard === "string"),
  }));
}

/** A data URL from a File or Blob. */
function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Photos bigger than this aren't kept for undo (history lives in storage).
const PHOTO_LIMIT = 2 * 1024 * 1024;

export const api = {
  async get(id) {
    try {
      const node = await contacts().get(id);
      return node ? contactOf(node) : null;
    } catch {
      return null;
    }
  },
  update(id, vCard) {
    return contacts().update(id, { vCard });
  },
  create(parentId, vCard) {
    return contacts().create(parentId, null, { vCard });
  },
  remove(id) {
    return contacts().delete(id);
  },
  async photo(id) {
    const file = await contacts().getPhoto(id);
    return file && file.size <= PHOTO_LIMIT ? toDataUrl(file) : null;
  },
  async setPhoto(id, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const type = blob.type || "image/jpeg";
    await contacts().setPhoto(id, new File([blob], `photo.${type.split("/")[1] ?? "jpg"}`, { type }));
  },
  /**
   * Clears a card's leftover properties (the bug above) and saves it again
   * as it is: its vCard doesn't change. Returns how many were cleared.
   */
  async repair(id) {
    const node = await contacts().get(id);
    const properties = node?.properties ?? {};
    const junk = Object.keys(properties).filter(isJunkProperty);
    if (!junk.length) {
      return 0;
    }
    await contacts().update(id, { vCard: properties.vCard, ...Object.fromEntries(junk.map((name) => [name, null])) });
    return junk.length;
  },
};

/** A card's photo as an object URL for an <img>, or null when it has none. */
export async function photoUrl(id) {
  const file = await contacts().getPhoto(id).catch(() => null);
  return file ? URL.createObjectURL(file) : null;
}

/** Calls `listener` (debounced) whenever a card or address book changes. */
export function onAddressBookChange(listener, wait = 600) {
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(listener, wait);
  };
  const events = [
    contacts().onCreated, contacts().onUpdated, contacts().onDeleted, contacts().onManyCreated,
    browser.addressBooks.onCreated, browser.addressBooks.onUpdated, browser.addressBooks.onDeleted,
  ].filter(Boolean);
  for (const event of events) {
    event.addListener(fire);
  }
  return () => events.forEach((event) => event.removeListener(fire));
}
