/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { omemoClient, OMEMO_ID, namesSummary, namesRow } from "../src/lib/omemo.js";

test("messages go to OMEMO for Thunderbird's id", async () => {
  const sent = [];
  const client = omemoClient(async (id, message) => {
    sent.push([id, message]);
    return message.command === "hello" ? { name: "OMEMO for Thunderbird", version: "0.1.5", protocol: 1 } : { cards: 0, accounts: [] };
  });
  assert.deepEqual(await client.status(), { installed: true, info: { name: "OMEMO for Thunderbird", version: "0.1.5", protocol: 1 } });
  await client.preview();
  await client.setMode("test1@test.snikket.chat", "local");
  assert.deepEqual(sent.map(([id]) => id), [OMEMO_ID, OMEMO_ID, OMEMO_ID]);
  assert.deepEqual(sent[2][1], { command: "chatNames.setMode", jid: "test1@test.snikket.chat", mode: "local" });
});

test("not installed, turned off, or too old: no answer", async () => {
  const missing = omemoClient(async () => {
    throw new Error("Could not establish connection. Receiving end does not exist.");
  });
  assert.deepEqual(await missing.status(), { installed: false });
  assert.deepEqual(await omemoClient(async () => undefined).status(), { installed: false });
});

test("summaries use OMEMO's own wording", () => {
  const account = {
    mode: "off",
    contacts: [
      { jid: "+15551234567@cheogram.com", status: "set", name: "Jane Doe" },
      { jid: "+15559876543@cheogram.com", status: "unmatched" },
      { jid: "test2@test.snikket.chat", status: "named", name: "Test Two" },
    ],
  };
  assert.equal(namesSummary(account), "1 contact would get a name. 1 already has the name from the address book. 1 isn't in the address book.");
  assert.equal(namesRow(account.contacts[0], "off"), "Would get Jane Doe");
  assert.equal(namesRow({ status: "kept", current: "JD" }, "local"), "Keeps JD");
  assert.equal(namesSummary({ mode: "off", contacts: [] }), "No chat contacts on this account.");
});
