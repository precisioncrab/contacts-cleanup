/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The project's rules, checked: official APIs only (no Experiment), only
// the permissions it needs, MPL headers, card data never as HTML, no
// network use, and a package that holds what the manifest names.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { packageFiles } from "../scripts/package.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const read = (file) => readFileSync(join(root, file), "utf8");
const sources = packageFiles().filter((f) => /\.(js|css|html)$/.test(f));

test("no Experiment, and only the permissions it needs", () => {
  assert.equal(manifest.experiment_apis, undefined);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ["addressBooks", "menus", "storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.browser_specific_settings.gecko.id, "contacts-cleanup@precisioncrab");
  assert.equal(JSON.parse(read("package.json")).version, manifest.version);
});

test("every file the manifest names is in the package", () => {
  const files = new Set(packageFiles());
  const named = [
    ...manifest.background.scripts,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const file of named) {
    assert.ok(files.has(file), file);
  }
  assert.ok(files.has("src/ui/tab.html"));
  assert.ok(!packageFiles().some((f) => f.startsWith("test/") || f.startsWith("docs/")));
});

test("pages only load files that exist", () => {
  for (const page of packageFiles().filter((f) => f.endsWith(".html"))) {
    for (const [, src] of read(page).matchAll(/(?:src|href)="([^"#:]+)"/g)) {
      assert.ok(existsSync(join(root, dirname(page), src)), `${page}: ${src}`);
    }
  }
});

test("every source file carries the MPL-2.0 header", () => {
  for (const file of sources.filter((f) => !f.endsWith(".html"))) {
    assert.match(read(file), /Mozilla Public\s+\* License, v\. 2\.0/, file);
  }
});

test("no HTML injection, eval or network use", () => {
  for (const file of sources.filter((f) => f.endsWith(".js"))) {
    const text = read(file);
    assert.doesNotMatch(text, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, file);
    assert.doesNotMatch(text, /XMLHttpRequest|WebSocket|https?:\/\/(?!github\.com\/precisioncrab|addons\.thunderbird\.net|jmp\.chat|(?:www\.)?mozilla\.org\/MPL)/, file);
  }
});

test("imports resolve", () => {
  for (const file of sources.filter((f) => f.endsWith(".js"))) {
    for (const [, path] of read(file).matchAll(/from "(\.[^"]+)"/g)) {
      assert.ok(existsSync(join(root, dirname(file), path)), `${file}: ${path}`);
    }
  }
});
