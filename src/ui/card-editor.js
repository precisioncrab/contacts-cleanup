/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Edit card: one card with every field it can have, each editable, opened
 * from any page's detail panel (and from each row on Missing names). It
 * takes the place of the page until Save or Back. Saving is one change
 * with undo, written by the merge code with a single card (mergeVCard), so
 * fields this page doesn't show stay on the card as they are.
 *
 * Also the address boxes, value types and "+ Add" labels the merge page
 * uses.
 */

import { h } from "./dom.js";
import { avatar, tag } from "./parts.js";
import { label } from "../core/card.js";
import { comparable } from "../core/vcard.js";
import { mergeOptions, mergeVCard, MULTI, SINGLE, ADD_TYPES } from "../core/duplicates.js";

/** How a value's type reads next to it. */
export const TYPE_NAMES = { cell: "mobile", mobile: "mobile", iphone: "mobile", home: "home", work: "work", fax: "fax", pager: "pager", main: "main", other: "other" };

/** The "+ Add" buttons under fields with several values. */
export const ADD_LABELS = { TEL: "+ Add a phone number", EMAIL: "+ Add an email address", IMPP: "+ Add a chat address", ADR: "+ Add an address", URL: "+ Add a website" };

export const PLACEHOLDERS = { TEL: "Phone number", EMAIL: "Email address", IMPP: "xmpp:name@example.org", URL: "Website" };

/** An address as Street, City, State, Postal code and Country boxes; PO box and extended parts are kept as they are. */
export function addressEditor(id, parts, onChange, disabled) {
  const current = [...parts];
  const box = (index, placeholder, extra = "") => h("input", {
    type: "text",
    id: `${id}-${extra || index}`,
    class: extra,
    value: current[index] ?? "",
    placeholder,
    disabled,
    "aria-label": placeholder,
    onInput: (e) => {
      current[index] = e.target.value;
      onChange([...current]);
    },
  });
  return h("div", { class: "adr-edit" },
    box(2, "Street", "street"),
    box(3, "City"),
    box(4, "State or region"),
    box(5, "Postal code"),
    box(6, "Country"));
}

/** Opens a card in the editor. `name` starts the Name box with something else than the card's (a proposed name). */
export function openEditor(ctx, cardId, { name = null } = {}) {
  ctx.state.editor = { id: cardId, name, ed: null };
  ctx.render();
}

function closeEditor(ctx) {
  ctx.state.editor = null;
  ctx.render();
}

/** The editor's starting values: the card as it is, every value kept. */
function startValues(card, name) {
  const options = mergeOptions([card]);
  const single = {};
  for (const field of SINGLE) {
    single[field.name] = options.single.find((s) => s.name === field.name)?.values[0]?.text ?? "";
  }
  const multi = {};
  for (const field of options.multi) {
    multi[field.name] = new Set(field.values.map((v) => v.key));
  }
  return {
    options,
    name: name ?? card.name,
    given: card.nameParts.given,
    family: card.nameParts.family,
    single,
    multi,
    note: options.notes[0]?.text ?? "",
    edits: {},
    added: {},
  };
}

function vCardFor(card, ed) {
  return mergeVCard([card], card.id, {
    name: ed.name.trim(),
    given: ed.given.trim(),
    family: ed.family.trim(),
    multi: ed.multi,
    single: ed.single,
    note: ed.note,
    edits: ed.edits,
    added: ed.added,
  });
}

async function save(ctx, card) {
  const vCard = vCardFor(card, ctx.state.editor.ed);
  if (comparable(vCard) === comparable(card.vCard)) {
    closeEditor(ctx);
    return;
  }
  const name = ctx.state.editor.ed.name.trim() || label(card);
  const entry = await ctx.apply(`Edited ${name}`, [{ type: "update", id: card.id, vCard, label: name }]);
  if (entry) {
    closeEditor(ctx);
  }
}

const isoDate = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text);

/** The Edit card page, in place of the page it was opened from. */
export function editorPage(ctx) {
  const st = ctx.state.editor;
  const card = ctx.state.cards.find((c) => c.id === st.id);
  const back = h("button", { onClick: () => closeEditor(ctx) }, "‹ Back");
  if (!card) {
    return [
      h("div", { class: "toolbar" }, back, h("h2", {}, "Edit card")),
      h("div", { class: "page" }, h("div", { class: "notice" }, "This card isn't in the address book any more (or its address book is unchecked in the sidebar).")),
    ];
  }
  st.ed ??= startValues(card, st.name);
  const ed = st.ed;
  const saveButton = (big) => h("button", {
    class: "primary",
    style: big ? { padding: "8px 18px", fontSize: "13px" } : null,
    disabled: Boolean(ctx.state.busy),
    onClick: () => save(ctx, card),
  }, ctx.state.busy ? "Saving…" : "Save");
  const field = (text, ...body) => h("div", { class: "field" }, h("span", { class: "field-label" }, text), h("div", { class: "field-value" }, body));
  const textBox = (id, value, onInput, placeholder = "") => h("input", { type: "text", id, value, placeholder, onInput: (e) => onInput(e.target.value) });

  return [
    h("div", { class: "toolbar" },
      back,
      h("h2", { style: { flex: "1" } }, `Edit ${label(card)}`),
      h("button", { onClick: () => closeEditor(ctx) }, "Cancel"),
      saveButton(false)),
    h("div", { class: "page", "data-scroll": "editor" },
      h("div", { class: "detail-head", style: { marginTop: "8px" } },
        avatar(card, true),
        h("div", { class: "who" }, h("div", { class: "name" }, label(card)), h("div", { class: "book" }, card.bookName))),
      st.name !== null && st.name !== card.name
        ? h("p", { class: "hint" }, `The Name box holds the proposed name, ${st.name}. Change it if it isn't right.`)
        : null,

      h("div", { class: "fields" },
        field("Name", textBox("ed-name", ed.name, (v) => {
          ed.name = v;
        }, "Display name")),
        field("First name", textBox("ed-given", ed.given, (v) => {
          ed.given = v;
        })),
        field("Last name", textBox("ed-family", ed.family, (v) => {
          ed.family = v;
        })),
        SINGLE.map((f) => {
          const value = ed.single[f.name] ?? "";
          const set = (v) => {
            ed.single[f.name] = v;
          };
          // Dates as date pickers, unless the card holds one a picker can't show (no year, say).
          const dated = (f.name === "BDAY" || f.name === "ANNIVERSARY") && (!value || isoDate(value));
          return field(f.label, dated
            ? h("input", { type: "date", id: `ed-${f.name.toLowerCase()}`, value, onChange: (e) => set(e.target.value) })
            : textBox(`ed-${f.name.toLowerCase()}`, value, set));
        })),

      MULTI.map((f) => {
        const values = ed.options.multi.find((m) => m.name === f.name)?.values ?? [];
        const added = ed.added[f.name] ?? [];
        ed.multi[f.name] ??= new Set();
        return h("div", { class: "page-section" },
          h("div", { class: "label" }, f.label),
          values.map((v, i) => {
            const on = ed.multi[f.name].has(v.key);
            const edited = ed.edits[f.name]?.[v.key];
            const setEdit = (value) => {
              ed.edits[f.name] = { ...ed.edits[f.name], [v.key]: value };
            };
            return h("div", { class: `value-row${on ? "" : " off"}` },
              f.name === "ADR"
                ? addressEditor(`ed-adr-${i}`, edited ?? v.parts, setEdit, !on)
                : h("input", { type: "text", id: `ed-${f.name}-${i}`, value: edited ?? v.text, disabled: !on, "aria-label": f.label, onInput: (e) => setEdit(e.target.value) }),
              v.type ? tag(TYPE_NAMES[v.type] ?? v.type, "plain") : null,
              on
                ? h("button", { class: "link", title: "Remove", "aria-label": `Remove ${v.text}`, onClick: () => {
                  ed.multi[f.name].delete(v.key);
                  ctx.render();
                } }, "✕")
                : [h("span", { class: "from" }, "removed"), h("button", { class: "link", onClick: () => {
                  ed.multi[f.name].add(v.key);
                  ctx.render();
                } }, "Restore")]);
          }),
          added.map((a, i) => h("div", { class: "value-row" },
            f.name === "ADR"
              ? addressEditor(`ed-add-adr-${i}`, a.value, (value) => {
                a.value = value;
              }, false)
              : h("input", { type: "text", id: `ed-add-${f.name}-${i}`, value: a.value, placeholder: PLACEHOLDERS[f.name], "aria-label": `New ${f.label}`, onInput: (e) => {
                a.value = e.target.value;
              } }),
            ADD_TYPES[f.name]?.length > 1
              ? h("select", { class: "type-select", "aria-label": "Type", onChange: (e) => {
                a.type = e.target.value;
              } }, ADD_TYPES[f.name].map(([value, text]) => h("option", { value, selected: a.type === value }, text)))
              : null,
            h("button", { class: "link", title: "Remove", "aria-label": "Remove", onClick: () => {
              ed.added[f.name].splice(i, 1);
              ctx.render();
            } }, "✕"))),
          values.length || added.length ? null : h("div", { class: "hint" }, "None."),
          h("button", { class: "link add-value", style: { marginLeft: "0" }, onClick: () => {
            ed.added[f.name] = [...added, { value: f.name === "ADR" ? ["", "", "", "", "", "", ""] : "", type: ADD_TYPES[f.name]?.[0]?.[0] ?? "" }];
            ctx.render();
            document.getElementById(f.name === "ADR" ? `ed-add-adr-${added.length}-street` : `ed-add-${f.name}-${added.length}`)?.focus();
          } }, ADD_LABELS[f.name]));
      }),

      h("div", { class: "page-section" },
        h("div", { class: "label" }, "Note"),
        h("textarea", { id: "ed-note", value: ed.note, onInput: (e) => {
          ed.note = e.target.value;
        } })),

      h("div", { class: "merge-bar" }, saveButton(true), h("span", { class: "hint" }, "Undo (the message after saving, or Changes) puts the card back as it was."))),
  ];
}

/** The detail panel while a card is open in the editor. */
export function editorDetail() {
  return [
    h("h3", {}, "Edit card"),
    h("p", {}, "Every box can be changed. ✕ removes a value (Restore brings it back before you save); + Add puts in a new one."),
    h("p", {}, "Save writes the card to the address book, and to its server for an address book that syncs. Undo (the message after saving, or Changes) puts it back."),
    h("p", {}, "Anything else on the card (its photo, categories, custom fields) stays as it is."),
  ];
}
