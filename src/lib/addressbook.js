/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Thunderbird's address books, through the official API only
 * (addressBooks and addressBooks.contacts, Manifest V3, Thunderbird 128
 * and later). The `api` object is what src/core/history.js expects.
 */

const contacts = () => browser.addressBooks.contacts;

/** Every address book with its cards: [{ id, name, readOnly, remote, contacts: [ContactNode] }]. */
export async function loadBooks() {
  const books = await browser.addressBooks.list(true);
  return books.map((book) => ({
    id: book.id,
    name: book.name,
    readOnly: Boolean(book.readOnly),
    remote: Boolean(book.remote),
    contacts: (book.contacts ?? []).filter((node) => typeof node.vCard === "string"),
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
      return (await contacts().get(id)) ?? null;
    } catch {
      return null;
    }
  },
  async update(id, vCard) {
    try {
      await contacts().update(id, vCard);
    } catch (e) {
      // The MV3 schema takes the vCard text; some guides show { vCard }.
      if (!/vCard|argument|type/i.test(e?.message ?? "")) {
        throw e;
      }
      await contacts().update(id, { vCard });
    }
  },
  create(parentId, vCard) {
    return contacts().create(parentId, vCard);
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
