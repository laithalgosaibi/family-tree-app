// finder.js
// The relationship finder: pick any two people and see how they are related,
// said both ways round, with the side of the family, the ancestors they share,
// and every person on the line between them.
// On a phone it fills the screen, with a button to see the line on the chart.
// On a Mac it sits down the right of the chart: click a box to set To, ⌥-click to set From.
// The words come from kin.js and the name matching from find.js.

import * as store from "./store.js";
import { relationship, pathWithWords, sideWords, whose, sharedAncestors } from "./kin.js";
import { search, fullName } from "./find.js";
import { h, icon, kicker } from "./ui.js";
import { branchOf, groups, suggestLinks, question } from "./branch.js";
import { showLink, linkIcon } from "./link.js";

const wide = window.matchMedia("(min-width: 700px)");
const mouse = window.matchMedia("(hover: hover) and (pointer: fine)");

export const finderIcon = (cls) => icon('<path d="M3 7h12.5M12.5 4l3 3-3 3M17 13H4.5M7.5 10l-3 3 3 3"/>', cls);
const swapIcon = () => icon('<path d="M7 16V4M4 7l3-3 3 3M13 4v12M10 13l3 3 3-3"/>');
const searchIcon = () => icon('<circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.6 12.6 17 17"/>');
const targetIcon = () => icon('<circle cx="10" cy="10" r="5.5"/><circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none"/>'
  + '<path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3"/>');

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

let panel = null;
let hooks = null; // { chart(), reveal(ids), onClose() }
let state = null; // { from, to, picking: null | "from" | "to", query, mini }

// panel: the element the finder draws into (the same one as the person card).
export function init(panelEl, options) {
  panel = panelEl;
  hooks = options;
  wide.addEventListener("change", () => {
    if (!state) return;
    state.mini = false;
    draw();
    follow();
  });
}

export const isOpen = () => !!state;

// Opens the finder. With no `to`, it starts by asking who to compare with.
export function open({ from, to } = {}) {
  const me = store.getMe()?.id;
  if (!me) return;
  from = from && store.getPerson(from) ? from : me;
  to = to && to !== from && store.getPerson(to) ? to : null;
  state = { from, to, picking: to ? null : "to", query: "", mini: false };
  document.body.classList.add("finder-on");
  panel.hidden = false;
  draw();
  panel.scrollTop = 0;
  follow();
}

// Closes it and puts the chart back to normal. The caller hides the panel.
export function close() {
  if (!state) return;
  state = null;
  document.body.classList.remove("finder-on");
  panel.classList.remove("finder", "full", "mini");
  hooks.chart()?.setPair(null);
}

// The tree changed (an edit, undo or import): draw again, dropping anyone who was deleted.
export function refresh() {
  if (!state) return;
  if (!store.getPerson(state.from)) state.from = store.getMe()?.id;
  if (state.to && !store.getPerson(state.to)) state.to = null;
  if (!state.from) return hooks.onClose();
  draw();
  follow({ move: false });
}

// Mac: a box on the chart was clicked. ⌥-click sets From, a plain click sets To.
export function pickFromChart(id, alt) {
  if (!state) return;
  set(alt ? "from" : "to", id);
}

// ---- Choosing people ----

function set(slot, id) {
  const other = slot === "from" ? state.to : state.from;
  // Picking the person already in the other slot swaps them round.
  if (id === other) {
    [state.from, state.to] = [state.to || state.from, state.from];
  } else {
    state[slot] = id;
  }
  state.picking = null;
  state.query = "";
  draw();
  panel.scrollTop = 0;
  follow();
}

function swap() {
  if (!state.to) return;
  [state.from, state.to] = [state.to, state.from];
  draw();
  follow({ move: false });
}

// The chart draws the gold line between the two, and on a Mac moves so the whole line shows.
function follow({ move = true } = {}) {
  const chart = hooks.chart();
  if (!chart || !state) return;
  const { from, to } = state;
  if (!to || from === to) return chart.setPair(null);
  const rel = relationship(store.getData(), from, to);
  const ids = rel.path.length ? rel.path : [from, to];
  hooks.reveal(ids);
  chart.setPair(from, to);
  if (move && (wide.matches || state.mini)) {
    // Wait a moment so the panel has its final size before fitting the chart around it.
    requestAnimationFrame(() => chart.fitTo(ids));
  }
}

// ---- Drawing ----

function draw() {
  const data = store.getData();
  const { from, to } = state;
  const full = !wide.matches && !state.mini;
  panel.classList.add("finder");
  panel.classList.toggle("full", full);
  panel.classList.toggle("mini", !wide.matches && state.mini);

  if (!wide.matches && state.mini) return drawMini(data);

  const header = wide.matches
    ? h("div", { class: "finder-head" },
      kicker("Relationship finder"),
      h("button", { class: "icon-btn", "aria-label": "Close the relationship finder", onclick: hooks.onClose }, "×"))
    : h("div", { class: "finder-bar" },
      h("button", { class: "text-btn back-btn", onclick: hooks.onClose }, "‹ Chart"),
      h("h2", { class: "finder-title" }, "Relationship"),
      h("span", {}));

  const body = state.picking ? picker(data) : answer(data);
  panel.replaceChildren(header, h("div", { class: "finder-body" }, pairCard(data), body));

  if (state.picking) {
    const input = panel.querySelector(".finder-search input");
    // On a phone the keyboard only opens if the tap itself focuses the box,
    // which it does here because draw() runs inside the tap.
    input?.focus({ preventScroll: true });
    if (input) input.setSelectionRange(input.value.length, input.value.length);
  }
}

// The From and To boxes, with the swap button between them.
function pairCard(data) {
  const slot = (name, id) => {
    const p = id && data.people[id];
    const isMe = id === data.meId;
    const picking = state.picking === name;
    return h("button", {
      type: "button",
      class: "pair-slot" + (picking ? " picking" : ""),
      "aria-label": `${cap(name)}: ${p ? fullName(p) : "nobody yet"}. Change`,
      onclick: () => {
        state.picking = picking ? null : name;
        state.query = "";
        draw();
      },
    },
    h("span", { class: "pair-label" }, cap(name)),
    h("span", { class: "pair-text" },
      p
        ? [h("span", { class: "pair-name" }, isMe ? "You" : fullName(p)),
          h("span", { class: "pair-sub" }, isMe ? fullName(p) : store.parentsLabel(p) || "Parents not added yet")]
        : [h("span", { class: "pair-name empty-name" }, "Choose someone"),
          h("span", { class: "pair-sub" }, "Tap to search by name")]));
  };
  return h("div", {},
    h("div", { class: "pair" },
      slot("from", state.from),
      h("span", { class: "pair-rule", "aria-hidden": "true" }),
      slot("to", state.to),
      h("button", { type: "button", class: "swap", "aria-label": "Swap From and To", disabled: !state.to, onclick: swap }, swapIcon())),
    wide.matches && mouse.matches && h("p", { class: "pair-hint" }, "Click anyone on the chart to set To. ⌥-click sets From."));
}

// ---- Choosing someone by name ----

function picker(data) {
  const input = h("input", {
    type: "search",
    class: "search-input",
    value: state.query,
    placeholder: state.picking === "from" ? "Search for From" : "Search for To",
    "aria-label": "Search by name",
    autocomplete: "off",
    autocapitalize: "words",
    spellcheck: "false",
    enterkeyhint: "search",
  });
  const list = h("div", { class: "finder-results" });
  const drawList = () => {
    state.query = input.value;
    list.replaceChildren(...results(data));
  };
  input.addEventListener("input", drawList);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelPick(); }
    if (e.key === "Enter") {
      e.preventDefault();
      list.querySelector(".result")?.click();
    }
  });
  list.replaceChildren(...results(data));
  return h("div", { class: "finder-pick" },
    h("div", { class: "finder-search" },
      h("label", { class: "search-box" }, searchIcon(), input),
      h("button", { type: "button", class: "text-btn plain", onclick: cancelPick }, "Cancel")),
    list);
}

function cancelPick() {
  state.picking = null;
  state.query = "";
  draw();
}

// Everyone whose name matches, each with whose child they are and what they are to you.
function results(data) {
  const query = state.query.trim();
  const row = (id, extraSub) => {
    const p = data.people[id];
    const rel = relationship(data, data.meId, id);
    const relText = rel.kind === "self" ? "You" : rel.kind === "none" ? "Not connected" : cap(rel.words);
    return h("button", { type: "button", class: "result", onclick: () => set(state.picking, id) },
      h("span", { class: "result-top" },
        h("span", { class: "result-name" }, fullName(p)),
        h("span", { class: "result-rel" + (rel.kind === "none" ? " none" : "") }, relText)),
      h("span", { class: "result-sub" }, extraSub || store.parentsLabel(p) || "Parents not added yet"));
  };
  if (!query) {
    const quick = [];
    // A short cut back to you, when you are not already in the other box.
    const other = state.picking === "from" ? state.to : state.from;
    if (data.meId !== other) quick.push(row(data.meId));
    return [h("p", { class: "search-empty" }, "Type a first name, father’s name or family name."), ...quick];
  }
  const found = search(data, query);
  const ids = [...found.named, ...found.other].flatMap((e) => (e.same ? e.items : [e])).map((e) => e.id);
  if (!ids.length) {
    return [h("div", { class: "search-empty" },
      h("p", {}, `No one in the tree is called “${query}”.`),
      h("p", { class: "hint" }, "Try fewer letters, or another way of spelling it."))];
  }
  return [kicker(ids.length === 1 ? "1 match" : `${ids.length} matches`), ...ids.map((id) => row(id))];
}

// ---- The answer ----

// "his", "her" or "their", for the second person.
const theirWord = (p) => (p.gender === "m" ? "his" : p.gender === "f" ? "her" : "their");

function answer(data) {
  const { from, to } = state;
  if (!to) return h("p", { class: "empty finder-empty" }, "Choose who to compare with, in the To box.");
  if (from === to) return h("p", { class: "empty finder-empty" }, "From and To are the same person. Choose someone else for one of them.");

  const pFrom = data.people[from];
  const pTo = data.people[to];
  const rel = relationship(data, from, to);

  if (rel.kind === "none") {
    return h("section", { class: "finder-answer" },
      kicker("Not connected yet"),
      h("h2", { class: "finder-words" }, "No line between them yet"),
      ...notConnected(data, from, to));
  }

  const back = relationship(data, to, from);
  const toIsMe = to === data.meId;
  const fromIsMe = from === data.meId;
  // "Dana is your", "Dana is Khalid’s", "You are Khalid’s".
  const lead = `${toIsMe ? "You are" : pTo.first + " is"} ${whose(data, from)}`;
  // Said the other way round: "You are her first cousin once removed."
  const backLine = `${fromIsMe ? "You are" : pFrom.first + " is"} ${toIsMe ? "your" : theirWord(pTo)} ${back.words}.`;
  const side = sideWords(data, rel.via, from);
  const also = rel.also.map((o) => {
    const s = sideWords(data, o.via, from);
    return `Also ${whose(data, from)} ${o.words}` + (s ? ", " + s.charAt(0).toLowerCase() + s.slice(1) : "");
  });

  return h("div", {},
    h("section", { class: "finder-answer" },
      kicker(lead),
      h("h2", { class: "finder-words" }, cap(rel.words)),
      h("p", { class: "finder-back" }, backLine),
      side && h("p", { class: "person-side" }, side),
      also.map((t) => h("p", { class: "person-side" }, t))),
    chain(data, rel),
    !wide.matches && h("button", { type: "button", class: "btn small with-icon finder-show", onclick: showOnChart },
      targetIcon(), "Show on the chart"));
}

// Not connected: which of them is in a separate branch, and a possible link between the two groups.
function notConnected(data, from, to) {
  const g = groups(data);
  const bTo = branchOf(data, to, g);
  const bFrom = branchOf(data, from, g);
  const inBranch = bTo ? to : bFrom ? from : null;
  const branch = bTo || bFrom;
  if (!branch) {
    return [h("p", { class: "finder-back" },
      `There is no line in the tree between ${nameOf(data, from)} and ${nameOf(data, to)} yet. `
      + "Link one of them to a relative of the other, and the answer appears here.")];
  }
  const other = inBranch === to ? from : to;
  const otherIds = g.groupOf.get(other).ids;
  const s = suggestLinks(data, branch.ids, otherIds)[0];
  const out = [h("p", { class: "finder-back" },
    `${fullName(data.people[inBranch])} is in ${branch.name.replace(/^The/, "the")}, which isn’t joined to your tree yet.`)];
  if (s) {
    out.push(h("div", { class: "branch-suggest finder-suggest" },
      kicker("Possible link"),
      h("p", { class: "branch-question" }, question(data, s)),
      h("p", { class: "row-sub" }, s.reason),
      h("button", { type: "button", class: "btn small with-icon", onclick: () => showLink(s.id, { role: s.role, otherId: s.otherId }) },
        linkIcon(), "Link them")));
  } else {
    out.push(h("button", { type: "button", class: "btn small with-icon finder-show", onclick: () => showLink(inBranch) },
      linkIcon(), `Link ${data.people[inBranch].first} to the tree`));
  }
  return out;
}

// "You" for you, otherwise their full name.
const nameOf = (data, id) => (id === data.meId ? "you" : fullName(data.people[id]));

// "How you’re connected": every step from From to To, each with what they are to From.
function chain(data, rel) {
  const { from } = state;
  const fromIsMe = from === data.meId;
  const steps = pathWithWords(data, from, rel.path);
  const common = new Set(rel.common);
  const shared = sharedAncestors(data, rel).map((id) => fullName(data.people[id]));
  const chart = hooks.chart();
  return h("section", { class: "group" },
    h("h3", { class: "group-title" }, fromIsMe ? "How you’re connected" : "How they’re connected"),
    shared.length > 0 && h("p", { class: "finder-shared" },
      (shared.length === 1 ? "Shared ancestor: " : "Shared ancestors: ") + shared.join(" and ")),
    h("ol", { class: "chain plain" }, steps.map((step, i) => {
      const p = data.people[step.id];
      const end = i === 0 || i === steps.length - 1;
      const sub = i === 0 ? (fromIsMe ? "You" : "From")
        : step.id === data.meId && !fromIsMe ? `You, ${whose(data, from)} ${step.words}`
        : fromIsMe ? cap(step.words) : `${cap(whose(data, from))} ${step.words}`;
      const inner = [
        h("span", { class: "chain-dot", "aria-hidden": "true" }),
        h("span", { class: "row-text" },
          h("span", { class: "chain-name" }, fullName(p)),
          h("span", { class: "row-sub" },
            sub,
            common.has(step.id) && h("span", { class: "tag" }, "Common ancestor"))),
      ];
      // On a Mac, clicking a step moves the chart to them.
      return h("li", { class: "chain-step" + (end ? " end" : "") },
        wide.matches && chart
          ? h("button", { class: "chain-btn", onclick: () => chart.centreOn(step.id) }, inner)
          : h("div", { class: "chain-btn" }, inner));
    })));
}

// ---- Phone: the line on the chart, with a small bar to go back to the answer ----

function showOnChart() {
  state.mini = true;
  draw();
  follow();
}

function drawMini(data) {
  const { from, to } = state;
  const rel = relationship(data, from, to);
  const pTo = data.people[to];
  const words = rel.kind === "none" ? "Not connected yet"
    : `${to === data.meId ? "You are" : pTo.first + " is"} ${whose(data, from)} ${rel.words}`;
  panel.replaceChildren(
    h("div", { class: "mini-bar" },
      h("button", { type: "button", class: "mini-text", onclick: backToAnswer },
        kicker("Relationship"),
        h("span", { class: "mini-words" }, words)),
      h("button", { type: "button", class: "text-btn", onclick: backToAnswer }, "Answer"),
      h("button", { type: "button", class: "icon-btn", "aria-label": "Close the relationship finder", onclick: hooks.onClose }, "×")));
}

function backToAnswer() {
  state.mini = false;
  draw();
  panel.scrollTop = 0;
}
