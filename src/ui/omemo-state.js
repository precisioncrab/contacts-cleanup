/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * What OMEMO for Thunderbird says, shared by the Chat addresses page and
 * the contact editor: whether it's there, each account's chat list, and
 * whether it can add people to the chat list (OMEMO for Thunderbird 0.1.6,
 * OMEMO Pro 0.3.4 and later). Kept in ctx.state.omemo.
 */

import { phoneOfChatAddress } from "../core/chat-list.js";

const message = (e) => e?.message ?? String(e);
let refreshTimer = null;

/** Asks OMEMO for Thunderbird whether it's there, for the chat list, and whether it adds contacts. */
export async function refreshOmemo(ctx) {
  const omemo = ctx.state.omemo;
  omemo.loading = true;
  omemo.error = null;
  ctx.render();
  const status = await ctx.omemo.status();
  omemo.status = status;
  omemo.result = null;
  omemo.canAdd = false;
  if (status.installed) {
    try {
      omemo.result = await ctx.omemo.preview();
    } catch (e) {
      omemo.error = message(e);
    }
    omemo.canAdd = await ctx.omemo.canAddContacts();
  }
  omemo.loading = false;
  ctx.render();
}

/** Asks again in a moment: OMEMO names chat contacts 3 seconds after a card changes, and a new chat contact arrives from the server. */
export function refreshOmemoSoon(ctx, wait = 4000) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!ctx.state.omemo.loading && ctx.state.omemo.status?.installed) {
      refreshOmemo(ctx);
    }
  }, wait);
}

/** The account shown: the one picked on the Chat list tab, else the first. */
export function currentAccount(ctx) {
  const accounts = ctx.state.omemo.result?.accounts ?? [];
  return accounts.find((a) => a.jid === ctx.state.chat.account) ?? accounts[0] ?? null;
}

/** Whether a chat address is in the current account's chat list (a JMP.chat or Quicksy address by its number); null without OMEMO. */
export function chatListHas(ctx) {
  const account = currentAccount(ctx);
  if (!account) {
    return null;
  }
  const jids = new Set(account.contacts.map((c) => c.jid.toLowerCase()));
  const phones = new Set(account.contacts.map((c) => phoneOfChatAddress(c.jid)).filter(Boolean));
  return (address) => {
    const jid = String(address ?? "").toLowerCase();
    return jids.has(jid) || phones.has(phoneOfChatAddress(jid));
  };
}

/**
 * Adds and takes off chat list contacts on the current account:
 * add [{ jid, name }], remove [jid]. Returns a line saying what happened.
 */
export async function changeChatList(ctx, { add = [], remove = [] }) {
  const account = currentAccount(ctx);
  if (!account || (!add.length && !remove.length)) {
    return "";
  }
  const lines = [];
  const failed = [];
  try {
    if (add.length) {
      const result = await ctx.omemo.addContacts(account.jid, add);
      if (result?.added?.length) {
        lines.push(`Added ${result.added.length} to the chat list`);
      }
      failed.push(...(result?.failed ?? []));
    }
    if (remove.length) {
      const result = await ctx.omemo.removeContacts(account.jid, remove);
      if (result?.removed?.length) {
        lines.push(`Took ${result.removed.length} off the chat list`);
      }
      failed.push(...(result?.failed ?? []));
    }
  } catch (e) {
    failed.push({ jid: "", error: message(e) });
  }
  refreshOmemoSoon(ctx, 2000);
  if (failed.length) {
    lines.push(`Couldn't change: ${failed.map((f) => (f.jid ? `${f.jid} (${f.error})` : f.error)).join(", ")}`);
  }
  return `${lines.join(". ")} on ${account.jid}.`;
}
