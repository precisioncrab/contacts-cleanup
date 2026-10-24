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
 *
 * Contact ids: Thunderbird names a contact by its UID only, and the same
 * contact can sit in two address books with one UID (a book imported from
 * another). contacts.get, update and delete then reach only one of the
 * copies, whichever Thunderbird finds first. So every card here is named
 * "<address book id>»<UID>", and a write checks that Thunderbird reaches
 * that very copy; it refuses rather than change the other one.
 */

const contacts = () => browser.contacts ?? browser.addressBooks.contacts;
const SEP = "»";

/** A card's id here: its address book and its UID. */
export const cardKey = (parentId, uid) => `${parentId}${SEP}${uid}`;

/** { book, uid } from a card's id (book is null for a plain UID, as in older undo history). */
export function splitKey(key) {
  const at = String(key).indexOf(SEP);
  return at < 0 ? { book: null, uid: String(key) } : { book: key.slice(0, at), uid: key.slice(at + SEP.length) };
}

/** A property Thunderbird stored from one character of a vCard (the bug above): a name that's only digits. */
export const isJunkProperty = (name) => /^\d+$/.test(name);

/** A contact node as the rest of the add-on uses it: { id, uid, parentId, readOnly, vCard, junk } (junk: how many leftover properties). */
function contactOf(node) {
  const properties = node.properties ?? {};
  return {
    id: cardKey(node.parentId, node.id),
    uid: node.id,
    parentId: node.parentId,
    type: node.type,
    readOnly: Boolean(node.readOnly),
    vCard: node.vCard ?? properties.vCard,
    junk: Object.keys(properties).filter(isJunkProperty).length,
  };
}

/** A mailing list as the rest of the add-on uses it: { id, parentId, name, nickName, description, members: [UID] }. */
const listOf = (node, parentId) => ({
  id: node.id,
  parentId,
  name: node.name ?? "",
  nickName: node.nickName ?? "",
  description: node.description ?? "",
  members: (node.contacts ?? []).map((c) => c.id),
});

/** Every address book with its cards and mailing lists: [{ id, name, readOnly, remote, contacts: [contact], lists: [list] }]. */
export async function loadBooks() {
  const books = await browser.addressBooks.list(true);
  return books.map((book) => ({
    id: book.id,
    name: book.name,
    readOnly: Boolean(book.readOnly),
    remote: Boolean(book.remote),
    contacts: (book.contacts ?? []).map(contactOf).filter((c) => typeof c.vCard === "string"),
    lists: (book.mailingLists ?? []).map((list) => listOf(list, book.id)),
  }));
}

/** Which address book's copy Thunderbird reaches for this UID (the one add-ons can change), or null. */
export async function reachableBook(uid) {
  try {
    return (await contacts().get(uid))?.parentId ?? null;
  } catch {
    return null;
  }
}

/**
 * The node Thunderbird reaches for a card id, after checking it's that
 * address book's copy. Throws when Thunderbird would reach another copy.
 */
async function reach(key) {
  const { book, uid } = splitKey(key);
  const node = await contacts().get(uid);
  if (node && book && node.parentId !== book) {
    throw new Error("This contact is in two address books with the same ID, and Thunderbird only lets add-ons change the copy in the other one. Nothing was changed.");
  }
  return { node, uid };
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
  async get(key) {
    try {
      const { book, uid } = splitKey(key);
      const node = await contacts().get(uid);
      return node && (!book || node.parentId === book) ? contactOf(node) : null;
    } catch {
      return null;
    }
  },
  async update(key, vCard) {
    const { uid } = await reach(key);
    return contacts().update(uid, { vCard });
  },
  async create(parentId, vCard) {
    return cardKey(parentId, await contacts().create(parentId, null, { vCard }));
  },
  async remove(key) {
    const { uid } = await reach(key);
    return contacts().delete(uid);
  },
  async photo(key) {
    const file = await contacts().getPhoto(splitKey(key).uid);
    return file && file.size <= PHOTO_LIMIT ? toDataUrl(file) : null;
  },
  async setPhoto(key, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const type = blob.type || "image/jpeg";
    await contacts().setPhoto(splitKey(key).uid, new File([blob], `photo.${type.split("/")[1] ?? "jpg"}`, { type }));
  },
  /**
   * The mailing lists of the card's own address book it's a member of
   * (ids). A list holds cards of its own book, named by UID.
   */
  async listsOf(key) {
    const { book, uid } = splitKey(key);
    const lists = book ? await browser.mailingLists.list(book).catch(() => []) : [];
    const ids = [];
    for (const list of lists) {
      const members = await browser.mailingLists.listMembers(list.id).catch(() => []);
      if (members.some((m) => m.id === uid)) {
        ids.push(list.id);
      }
    }
    return ids;
  },
  /** Adds a card to a mailing list of its address book; false when the list is gone. */
  async addToList(listId, key) {
    try {
      await browser.mailingLists.get(listId);
    } catch {
      return false;
    }
    await browser.mailingLists.addMember(listId, splitKey(key).uid);
    return true;
  },
  /** A mailing list as { id, parentId, name, nickName, description, members: [card id] }, or null. */
  async getList(id) {
    try {
      const node = await browser.mailingLists.get(id);
      const members = await browser.mailingLists.listMembers(id);
      return { ...listOf(node, node.parentId), members: members.map((m) => cardKey(node.parentId, m.id)) };
    } catch {
      return null;
    }
  },
  async createList(parentId, { name, nickName = "", description = "" }) {
    return browser.mailingLists.create(parentId, { name, nickName, description });
  },
  async deleteList(id) {
    return browser.mailingLists.delete(id);
  },
  /**
   * Clears a card's leftover properties (the bug above) and saves it again
   * as it is: its vCard doesn't change. Returns how many were cleared.
   */
  async repair(key) {
    const { node, uid } = await reach(key);
    const properties = node?.properties ?? {};
    const junk = Object.keys(properties).filter(isJunkProperty);
    if (!junk.length) {
      return 0;
    }
    await contacts().update(uid, { vCard: properties.vCard, ...Object.fromEntries(junk.map((name) => [name, null])) });
    return junk.length;
  },
};

/** A card's photo as an object URL for an <img>, or null when it has none. */
export async function photoUrl(key) {
  const file = await contacts().getPhoto(splitKey(key).uid).catch(() => null);
  return file ? URL.createObjectURL(file) : null;
}

/** Calls `listener` (debounced) whenever a card or address book changes. */
export function onAddressBookChange(listener, wait = 600) {
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(listener, wait);
  };
  const lists = browser.mailingLists ?? {};
  const events = [
    contacts().onCreated, contacts().onUpdated, contacts().onDeleted, contacts().onManyCreated,
    browser.addressBooks.onCreated, browser.addressBooks.onUpdated, browser.addressBooks.onDeleted,
    lists.onCreated, lists.onUpdated, lists.onDeleted, lists.onMemberAdded, lists.onMemberRemoved,
  ].filter(Boolean);
  for (const event of events) {
    event.addListener(fire);
  }
  return () => events.forEach((event) => event.removeListener(fire));
}
