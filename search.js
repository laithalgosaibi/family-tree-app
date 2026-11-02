// search.js
// The search box. On a phone it is a magnifying glass at the top that opens a full screen
// of results. On a Mac it is a box at the top left, with results in a drop-down and the
// highlighted person's parents beside them. Picking someone shows them on the chart.
// Which people match is worked out in find.js.

import * as store from "./store.js";
import { search, diffWords, fullName } from "./find.js";
import { relationship } from "./kin.js";
import { h, icon, kicker } from "./ui.js";

const wide = window.matchMedia("(min-width: 700px)");
const searchIcon = (cls) => icon('<circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.6 12.6 17 17"/>', cls);
const peopleIcon = () => icon('<circle cx="7.5" cy="7" r="2.6"/><path d="M2.8 16c.4-2.7 2.3-4.3 4.7-4.3s4.3 1.6 4.7 4.3"/><circle cx="13.6" cy="7.6" r="2.1"/><path d="M13.2 11.8c2 0 3.6 1.3 4 3.6"/>', "icon small");

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// What they are to you, short, for the right-hand side of a result.
function relShort(rel) {
  if (rel.kind === "self") return "You";
  if (rel.kind === "none") return "Not connected";
  return cap(rel.words);
}

let onPick = () => {};
let root, input, drop, list, preview;
let rows = []; // [{ id, el }] in the order shown, for the arrow keys
let current = -1; // which row is highlighted

// Builds the search and puts it in the top bar. pick(id) is called with the person chosen.
export function init(pick) {
  onPick = pick;
  input = h("input", {
    type: "search",
    class: "search-input",
    placeholder: "Search by name",
    "aria-label": "Search by name",
    autocomplete: "off",
    autocapitalize: "words",
    spellcheck: "false",
    enterkeyhint: "search",
  });
  const clear = h("button", { type: "button", class: "search-clear", "aria-label": "Clear", hidden: true,
    onclick: () => { input.value = ""; draw(); input.focus(); } }, "×");
  input.addEventListener("input", () => { clear.hidden = !input.value; draw(); });
  input.addEventListener("focus", () => { input.select(); draw(); });
  input.addEventListener("click", () => { if (drop.hidden) draw(); });
  input.addEventListener("keydown", onKey);

  list = h("div", { class: "search-list", role: "listbox", "aria-label": "Results" });
  preview = h("div", { class: "search-preview" });
  drop = h("div", { class: "search-drop", hidden: true }, list, preview);

  root = h("div", { class: "search" },
    h("button", { type: "button", class: "search-open", "aria-label": "Search by name", onclick: open }, searchIcon("icon search-glass")),
    h("div", { class: "search-bar" },
      h("label", { class: "search-box" }, searchIcon("icon"), input, clear),
      h("button", { type: "button", class: "text-btn plain search-cancel", onclick: close }, "Cancel")),
    drop);
  document.querySelector(".top").append(root);

  // Mac: clicking anywhere else closes the drop-down.
  document.addEventListener("pointerdown", (e) => {
    if (wide.matches && !root.contains(e.target)) hideDrop();
  });
  // ⌘F or / jumps to the search box.
  document.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("chart-mode") || document.querySelector("dialog[open]")) return;
    const find = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f";
    const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.target.closest?.("input, textarea");
    if (find || slash) { e.preventDefault(); open(); }
  });
  wide.addEventListener("change", () => close());
}

// Phone: opens the full-screen search. Mac: puts the cursor in the box.
export function open() {
  document.body.classList.add("searching");
  input.focus();
  draw();
}

export function close() {
  document.body.classList.remove("searching");
  hideDrop();
  input.blur();
}

function hideDrop() {
  drop.hidden = true;
  current = -1;
}

function onKey(e) {
  if (e.key === "Escape") { e.preventDefault(); close(); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!rows.length) return;
    const next = current + (e.key === "ArrowDown" ? 1 : -1);
    highlight(Math.max(0, Math.min(rows.length - 1, next)), true);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const row = rows[current] || rows[0];
    if (row) pick(row.id);
  }
}

function pick(id) {
  close();
  onPick(id);
}

// ---- The results ----

function draw() {
  const query = input.value.trim();
  const data = store.getData();
  rows = [];
  current = -1;
  if (!query) {
    list.replaceChildren(h("p", { class: "search-empty" }, "Type a first name, father’s name or family name."));
    preview.replaceChildren();
    drop.hidden = wide.matches;
    return;
  }
  drop.hidden = false;
  const found = search(data, query);
  if (!found.count) {
    list.replaceChildren(h("div", { class: "search-empty" },
      h("p", {}, `No one in the tree is called “${query}”.`),
      h("p", { class: "hint" }, "Try fewer letters, or another way of spelling it.")));
    preview.replaceChildren();
    return;
  }
  const section = (title, entries) => entries.length > 0 && h("section", { class: "search-group" },
    kicker(`${title} ${query} · ${entries.reduce((n, e) => n + (e.same ? e.items.length : 1), 0)}`),
    entries.map((e) => (e.same ? sameNames(e) : resultRow(e))));
  list.replaceChildren(...[
    section("Named", found.named),
    section("Father or family named", found.other),
  ].filter(Boolean));
  list.scrollTop = 0;
  if (wide.matches) highlight(0, false);
}

// One person: name, what they are to you, and whose child they are.
function resultRow(it, extra) {
  const p = it.person;
  const el = h("button", {
    type: "button",
    class: "result",
    role: "option",
    onclick: () => pick(it.id),
    onpointerenter: (e) => { if (wide.matches && e.pointerType === "mouse") highlight(rows.findIndex((r) => r.el === el), false); },
  },
    h("span", { class: "result-top" },
      h("span", { class: "result-name" }, fullName(p)),
      // Nobody set as you: there is nothing to say what they are to you.
      store.getMe() && h("span", { class: "result-rel" + (it.rel.kind === "none" ? " none" : "") }, relShort(it.rel))),
    extra || h("span", { class: "result-sub" }, store.parentsLabel(p) || "Parents not added yet"),
    it.spelled.length > 0 && h("span", { class: "tag plain-tag" }, "Spelled " + it.spelled.join(" ")));
  rows.push({ id: it.id, el });
  return el;
}

// Two or more people with the same full name, set side by side with both parents
// spelled out and the words that differ in gold.
function sameNames(group) {
  const parents = group.items.map((it) => {
    const ps = store.parentsOf(it.id);
    const father = ps.find((x) => x.gender === "m");
    const mother = ps.find((x) => x.gender === "f");
    const rest = ps.filter((x) => x !== father && x !== mother);
    return { father: father || rest.shift(), mother: mother || rest.shift() };
  });
  const fathers = diffWords(parents.map((x) => (x.father ? fullName(x.father) : null)));
  const mothers = diffWords(parents.map((x) => (x.mother ? fullName(x.mother) : null)));
  const words = (list) => list
    ? list.flatMap((w, i) => [i > 0 ? " " : "", w.differs ? h("em", { class: "differs" }, w.word) : w.word])
    : h("span", { class: "missing" }, "Not added yet");
  return h("div", { class: "same" },
    h("p", { class: "same-note" }, peopleIcon(), `${group.items.length} people named ${group.name}`),
    group.items.map((it, i) => resultRow(it,
      h("span", { class: "parents-table" },
        h("span", { class: "pt-label" }, "Father"), h("span", { class: "pt-name" }, words(fathers[i])),
        h("span", { class: "pt-label" }, "Mother"), h("span", { class: "pt-name" }, words(mothers[i]))))));
}

// Mac: highlights a row and shows that person's parents beside the list.
function highlight(index, scroll) {
  if (index < 0 || !rows[index]) return;
  rows.forEach((r, i) => r.el.classList.toggle("on", i === index));
  current = index;
  if (scroll) rows[index].el.scrollIntoView({ block: "nearest" });
  if (wide.matches) drawPreview(rows[index].id);
}

function drawPreview(id) {
  const data = store.getData();
  const p = store.getPerson(id);
  const rel = relationship(data, data.meId, id);
  const parents = store.parentsOf(id);
  const word = p.gender === "m" ? "Son of" : p.gender === "f" ? "Daughter of" : "Child of";
  const relOf = (x) => {
    const r = relationship(data, data.meId, x.id);
    if (!data.meId) return "";
    return r.kind === "self" ? "You" : r.kind === "none" ? "Not connected to you" : "Your " + r.words;
  };
  preview.replaceChildren(...[
    data.meId && kicker(rel.kind === "self" ? "You" : rel.kind === "none" ? "Not connected to you" : rel.words),
    h("h2", { class: "preview-name" }, fullName(p)),
    h("p", { class: "label-caps" }, word),
    parents.length
      ? parents.map((x) => h("div", { class: "preview-parent" },
        h("span", { class: "preview-parent-name" }, fullName(x)),
        h("span", { class: "result-sub" }, relOf(x))))
      : h("p", { class: "empty" }, "Parents not added yet."),
    h("button", { type: "button", class: "btn small preview-show", onclick: () => pick(id) }, "Show on the chart ↩"),
  ].flat());
}
