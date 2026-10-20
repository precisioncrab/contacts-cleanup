/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Builds dist/contacts-cleanup-<version>.xpi: manifest.json, LICENSE, the
 * icons and everything in src/, as they are (no build step, so the
 * package is the source addons.thunderbird.net reviews).
 *
 * No dependencies: the zip is written with Node's zlib (deflate and crc32,
 * Node 22+). Entries use forward slashes and a fixed timestamp, so the
 * same sources always give the same bytes.
 *
 * Run with: npm run package
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { deflateRawSync, crc32 } from "node:zlib";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

/** Every file under a folder, as paths relative to the repo with forward slashes. */
export function filesUnder(folder) {
  const out = [];
  for (const name of readdirSync(join(root, folder))) {
    const path = join(root, folder, name);
    if (statSync(path).isDirectory()) {
      out.push(...filesUnder(relative(root, path)));
    } else {
      out.push(relative(root, path).split(sep).join("/"));
    }
  }
  return out;
}

export const packageFiles = () => ["manifest.json", "LICENSE", ...filesUnder("icons"), ...filesUnder("src")].sort();

/** A zip archive of the given entries, deflated, with a fixed timestamp. */
export function zip(entries) {
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, the earliest zip date
  const UTF8_NAMES = 0x0800;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = packageFiles();
  const archive = zip(files.map((name) => ({ name, data: readFileSync(join(root, name)) })));
  let out = join(root, "dist", `contacts-cleanup-${manifest.version}.xpi`);
  mkdirSync(dirname(out), { recursive: true });
  try {
    writeFileSync(out, archive);
  } catch (e) {
    // Same version rebuilt while Thunderbird holds the file: add the time.
    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, "0")).join("");
    out = join(root, "dist", `contacts-cleanup-${manifest.version}-${time}.xpi`);
    writeFileSync(out, archive);
    console.log(`The usual file is in use (${e.code}), probably by Thunderbird; wrote a copy instead.`);
  }
  console.log(`Wrote ${out} (${files.length} files, version ${manifest.version}).`);
}
