// app.js
// The screens of the app. Data lives in store.js.

import * as store from "./store.js";
import { createChart } from "./chart.js";
import { h, kicker, openSheet, closeSheet, sheet, makeSegment } from "./ui.js";
import * as backup from "./backup.js";
import * as edit from "./edit.js";
import * as undo from "./undo.js";
import * as fold from "./fold.js";
import { relationship, pathWithWords } from "./kin.js";
import * as search from "./search.js";

const main = document.getElementById("main");

function byName(a, b) {
  return store.fullName(a).localeCompare(store.fullName(b));
}

// Words for one relative, shown under their name in a list.
function parentWord(p) {
  return p.gender === "m" ? "Father" : p.gender === "f" ? "Mother" : "Parent";
}
function childWord(p) {
  return p.gender === "m" ? "Son" : p.gender === "f" ? "Daughter" : "Child";
}

// ---- How someone is related to you, in words ----

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// What `id` is to you, worked out from the links. `data` can be a tree that is not saved yet.
function relToMe(id, data = store.getData()) {
  return relationship(data, data.meId, id);
}

// "Your first cousin once removed", "You", or null when they are not linked to you.
function relLabel(id) {
  const rel = relToMe(id);
  if (rel.kind === "self") return "You";
  return rel.kind === "none" ? null : "Your " + rel.words;
}

// Which side of the family: "On your father's side", "Through your wife, Sara".
function sideText(via, data = store.getData()) {
  if (!via) return "";
  if (via === "both") return "On both your father’s and mother’s sides";
  if (via.spouse) {
    const s = data.people[via.spouse];
    if (!s) return "";
    const link = data.spouses.find((l) => (l.a === data.meId && l.b === s.id) || (l.b === data.meId && l.a === s.id));
    const word = (link?.former ? "former " : "") + (s.gender === "m" ? "husband" : s.gender === "f" ? "wife" : "spouse");
    return `Through your ${word}, ${s.first}`;
  }
  const p = data.people[via];
  if (!p) return "";
  return p.gender === "m" ? "On your father’s side" : p.gender === "f" ? "On your mother’s side" : `Through your parent ${p.first}`;
}

// The other ways someone is related to you, when your parents are related to each other.
function alsoText(rel) {
  return rel.also.map((o) => {
    const side = sideText(o.via);
    return `Also your ${o.words}` + (side ? ", " + side.charAt(0).toLowerCase() + side.slice(1) : "");
  });
}

// "How you're connected": every step from you to them, each with what they are to you.
function connectionSection(rel) {
  const steps = pathWithWords(store.getData(), store.getMe().id, rel.path);
  const common = new Set(rel.common);
  return h("section", { class: "group" },
    h("h3", { class: "group-title" }, "How you’re connected"),
    h("ol", { class: "chain plain" }, steps.map((step, i) => {
      const p = store.getPerson(step.id);
      const end = i === 0 || i === steps.length - 1;
      return h("li", { class: "chain-step" + (end ? " end" : "") },
        h("button", { class: "chain-btn", onclick: () => showPerson(step.id, { centre: true }) },
          h("span", { class: "chain-dot", "aria-hidden": "true" }),
          h("span", { class: "row-text" },
            h("span", { class: "chain-name" }, store.fullName(p)),
            h("span", { class: "row-sub" },
              i === 0 ? "You" : cap(step.words),
              common.has(step.id) && h("span", { class: "tag" }, "Common ancestor")))));
    })));
}

// ---- Home screen: the family chart ----

let chart = null;
let panel = null;
let panelId = null; // the person whose card is open
let foldNote = null; // "2 branches collapsed · Expand all" at the top of the chart
const wide = window.matchMedia("(min-width: 700px)");

function renderHome() {
  const me = store.getMe();
  if (!me) {
    chart = null;
    panelId = null;
    document.body.classList.remove("chart-mode");
    return renderFirstOpen();
  }
  if (!chart) return buildChart();
  redraw(panelId || me.id);
  if (panelId && chart.has(panelId)) showPerson(panelId, { move: false });
  else if (panelId) closePanel();
}

// Draw the chart again, keeping one person still on screen.
function redraw(keep) {
  chart.update(store.getData(), { keep });
  drawFoldNote();
}

function drawFoldNote() {
  const count = fold.view(store.getData()).branches.size;
  foldNote.hidden = count === 0;
  foldNote.replaceChildren(
    h("span", {}, `${count} ${count === 1 ? "branch" : "branches"} collapsed`),
    h("button", { class: "text-btn", onclick: expandAll }, "Expand all"));
}

function expandAll() {
  fold.expandAll();
  redraw(panelId || store.getMe().id);
}

// Fold or open the branch under a person. They stay in the same spot on screen.
function toggleFold(id) {
  fold.toggle(id);
  redraw(id);
  if (panelId && !chart.has(panelId)) closePanel();
}

// Make sure a person is showing on the chart, opening any folded branch they are in.
function revealPerson(id) {
  const data = store.getData();
  const keep = fold.shownFoldFor(data, id); // the folded person they are under, on screen now
  if (!fold.reveal(data, id)) return;
  redraw(keep || id);
}

function centreOnMe() {
  const me = store.getMe();
  revealPerson(me.id);
  chart.centreOn(me.id);
}

function buildChart() {
  document.body.classList.add("chart-mode");
  const area = h("div", { class: "chart", tabindex: "0", "aria-label": "Family chart" });
  panel = h("aside", { class: "panel", hidden: true, "aria-label": "Person" });

  const zoomText = h("span", { class: "zoom-text", "aria-live": "polite" }, "100%");
  const controls = h("div", { class: "chart-controls" },
    h("div", { class: "zoom-group" },
      h("button", { class: "ctrl zoom-out", "aria-label": "Zoom out", onclick: () => chart.zoomBy(1 / 1.25) }, "−"),
      zoomText,
      h("button", { class: "ctrl zoom-in", "aria-label": "Zoom in", onclick: () => chart.zoomBy(1.25) }, "+")),
    h("button", { class: "ctrl centre", "aria-label": "Centre on me", onclick: centreOnMe },
      targetIcon(), h("span", { class: "centre-text" }, "Centre on me")));
  const hint = h("p", { class: "chart-hint" }, "Drag to move · pinch or ⌘-scroll to zoom");

  foldNote = h("div", { class: "fold-note", role: "status", hidden: true });

  main.replaceChildren(area, foldNote, controls, hint, panel);

  chart = createChart(area, {
    onSelect: (id) => showPerson(id),
    onEmpty: closePanel,
    onFold: toggleFold,
    insets: () => panel.hidden ? { right: 0, bottom: 0 }
      : wide.matches ? { right: panel.offsetWidth, bottom: 0 } : { right: 0, bottom: panel.offsetHeight },
  });
  chart.onZoom((s) => (zoomText.textContent = Math.round(s * 100) + "%"));
  chart.update(store.getData());
  drawFoldNote();
  chart.setScale(wide.matches ? 0.9 : 0.75);
  // If you are inside a folded branch, start on the person it is folded under.
  const meId = store.getMe().id;
  chart.centreOn(fold.shownFoldFor(store.getData(), meId) || meId, { animate: false });

  // The panel covers part of the chart, so the controls move out of its way.
  new ResizeObserver(() => {
    document.body.style.setProperty("--panel-h", panel.hidden ? "0px" : panel.offsetHeight + "px");
    document.body.style.setProperty("--panel-w", panel.hidden ? "0px" : panel.offsetWidth + "px");
  }).observe(panel);
}

function targetIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("class", "target");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<circle cx="10" cy="10" r="5.5"/><circle cx="10" cy="10" r="1.6" class="dot"/>'
    + '<path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3"/>';
  return svg;
}

function closePanel() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  panelId = null;
  document.body.style.setProperty("--panel-h", "0px");
  document.body.style.setProperty("--panel-w", "0px");
  chart.select(null);
}

// Keys on a Mac: Escape closes the card, + and − zoom, arrows move.
document.addEventListener("keydown", (e) => {
  if (!chart || sheet.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest("input, textarea")) return;
  const step = 80;
  const keys = {
    Escape: () => closePanel(),
    "+": () => chart.zoomBy(1.25), "=": () => chart.zoomBy(1.25), "-": () => chart.zoomBy(1 / 1.25),
    ArrowLeft: () => chart.panBy(step, 0), ArrowRight: () => chart.panBy(-step, 0),
    ArrowUp: () => chart.panBy(0, step), ArrowDown: () => chart.panBy(0, -step),
  };
  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});

function personRow(p, sub) {
  const rel = relLabel(p.id);
  return h("li", {},
    h("button", { class: "row", onclick: () => showPerson(p.id, { centre: true }) },
      h("span", { class: "row-text" },
        h("span", { class: "row-name" }, store.fullName(p)),
        rel && h("span", { class: "row-rel" }, rel),
        sub && h("span", { class: "row-sub" }, sub)),
      h("span", { class: "chevron", "aria-hidden": "true" }, "›")));
}

// ---- First open: an empty tree ----

function renderFirstOpen() {
  main.replaceChildren(
    h("div", { class: "first-open" },
      h("button", { class: "you-slot", onclick: () => showForm("me") }, "+ You"),
      h("div", { class: "first-text" },
        kicker("A new tree"),
        h("h2", {}, "Every tree starts with one person"),
        h("p", {}, "Add yourself first. Parents, children and partners branch out from you, one at a time."),
        h("button", { class: "btn wide", onclick: () => showForm("me") }, "Add yourself"),
        h("button", { class: "text-btn plain center-btn", onclick: backup.pickFile }, "Import a family file"),
        h("p", { class: "hint center" }, "Already have a tree on another device? Export it there, then import the .family file here."))));
  store.askToKeepData();
}

// ---- A person's card ----

// Opens the card for a person beside the chart (Mac) or under it (phone).
// centre: move the chart so they are in the middle. move: false leaves the chart still.
function showPerson(id, { centre = false, move = true } = {}) {
  const p = store.getPerson(id);
  if (!p) return closePanel();
  if (!chart.has(id)) { revealPerson(id); centre = true; }
  const isMe = p.id === store.getMe()?.id;
  const parents = store.parentsOf(id);
  const spouses = store.spousesOf(id);
  const children = store.childrenOf(id).sort(byName);
  const rel = relToMe(id);
  const side = sideText(rel.via);

  const group = (title, list, word) =>
    h("section", { class: "group" },
      h("h3", { class: "group-title" }, title),
      list.length
        ? h("ul", { class: "rows plain" }, list.map((x) => personRow(x, word(x))))
        : h("p", { class: "empty" }, `No ${title.toLowerCase()} added yet.`));

  const samePerson = !panel.hidden && panelId === id;
  panelId = id;
  panel.hidden = false;
  panel.replaceChildren(...[
    h("div", { class: "grabber", "aria-hidden": "true" }),
    h("div", { class: "card-top" },
      h("button", { class: "text-btn", onclick: () => edit.showEdit(id) }, "Edit"),
      h("button", { class: "icon-btn", "aria-label": "Close", onclick: closePanel }, "×")),
    kicker(isMe ? "You" : rel.kind === "none" ? "Not linked to you yet" : "Your " + rel.words),
    h("h2", { class: "person-name" }, store.fullName(p)),
    parents.length > 0 && h("p", { class: "person-parents" }, store.parentsLabel(p, { full: true })),
    side && h("p", { class: "person-side" }, side),
    ...alsoText(rel).map((t) => h("p", { class: "person-side" }, t)),
    h("div", { class: "actions" },
      h("button", { class: "action", disabled: parents.length >= 2, onclick: () => showForm("parent", id) },
        h("span", { class: "action-icon", "aria-hidden": "true" }, "↑"), "Add parent"),
      h("button", { class: "action", onclick: () => showForm("child", id) },
        h("span", { class: "action-icon", "aria-hidden": "true" }, "↓"), "Add child"),
      h("button", { class: "action", onclick: () => showForm("spouse", id) },
        h("span", { class: "action-icon", "aria-hidden": "true" }, "↔"), "Add spouse")),
    parents.length >= 2 && h("p", { class: "hint" }, "Both parents are added."),
    !isMe && rel.path.length > 1 && connectionSection(rel),
    rel.kind === "none" && h("section", { class: "group" },
      h("h3", { class: "group-title" }, "How you’re connected"),
      h("p", { class: "empty" }, "There is no line between you and them in the tree yet. Link them to a relative of yours to see how you are related.")),
    group("Parents", parents, parentWord),
    group(spouses.length > 1 ? "Spouses" : "Spouse", spouses, (s) => store.spouseWord(id, s.id)),
    group("Children", children, (c) => store.parentsLabel(c) || childWord(c)),
  ].filter(Boolean));
  if (!samePerson) panel.scrollTop = 0;
  document.body.style.setProperty("--panel-h", panel.offsetHeight + "px");
  document.body.style.setProperty("--panel-w", panel.offsetWidth + "px");
  chart.select(id);
  if (move) chart.centreOn(id, { onlyIfHidden: !centre });
}

// ---- One form for every new person ----
// kind is "me", "parent", "child" or "spouse". anchorId is the person tapped.

function showForm(kind, anchorId) {
  const anchor = anchorId ? store.getPerson(anchorId) : null;
  const anchorName = anchor ? store.fullName(anchor) : "";
  const parents = anchor ? store.parentsOf(anchor.id) : [];

  // What the person filled in by hand is never overwritten by a suggestion.
  const touched = new Set();

  // ---- The choice at the top (son or daughter, father or mother, ...) ----
  let gender = null;
  let former = false;
  let segment = null;

  if (kind === "me") {
    segment = makeSegment("Are you", [["m", "Male"], ["f", "Female"]], null, (v) => { gender = v; update(); });
  } else if (kind === "child") {
    segment = makeSegment("Son or daughter", [["m", "Son"], ["f", "Daughter"]], "m", (v) => { gender = v; update(); });
    gender = "m";
  } else if (kind === "parent") {
    const taken = parents[0]?.gender;
    gender = taken === "m" ? "f" : "m";
    segment = makeSegment("Father or mother", [["m", "Father"], ["f", "Mother"]], gender, (v) => { gender = v; suggest(); update(); },
      taken ? [taken] : []);
  } else {
    gender = anchor.gender === "m" ? "f" : anchor.gender === "f" ? "m" : null;
    segment = makeSegment("Marriage", [["no", "Married"], ["yes", "Divorced or widowed"]], "no", (v) => { former = v === "yes"; update(); });
  }
  // If we do not know the tapped person's gender, ask whether this is a husband or wife.
  const spouseGenderSeg = kind === "spouse" && !gender
    ? makeSegment("Husband or wife", [["m", "Husband"], ["f", "Wife"]], null, (v) => { gender = v; update(); })
    : null;

  // ---- Name fields ----
  const field = (name, label) => {
    const input = h("input", { name, autocomplete: "off", autocapitalize: "words", spellcheck: "false" });
    input.addEventListener("input", () => { touched.add(name); update(); });
    const hint = h("p", { class: "field-hint" });
    return { input, hint, el: h("label", { class: "field" }, h("span", { class: "field-label" }, label), input, hint) };
  };
  const first = field("first", "First name");
  const father = field("father", "Father’s name");
  const family = field("family", "Family name");
  const groupHint = h("p", { class: "field-hint" });

  // ---- Other parent (adding a child) ----
  let otherParent = null;
  let otherParentEl = null;
  if (kind === "child") {
    const spouses = store.spousesOf(anchor.id);
    if (spouses.length) {
      const current = spouses.filter((s) => !store.spouseWord(anchor.id, s.id).startsWith("Former"));
      otherParent = (current[current.length - 1] || spouses[spouses.length - 1]).id;
      const options = [...spouses.map((s) => [s.id, store.fullName(s), store.spouseWord(anchor.id, s.id)]),
        ["", "Not in the tree yet", "You can add them later"]];
      otherParentEl = h("div", { class: "field" },
        h("span", { class: "field-label" }, "Other parent"),
        h("div", { class: "choices", role: "radiogroup" }, options.map(([value, label, sub]) => {
          const input = h("input", { type: "radio", name: "other-parent", value, checked: value === (otherParent || "") });
          input.addEventListener("change", () => { otherParent = value || null; suggest(); update(); });
          return h("label", { class: "choice" }, input,
            h("span", { class: "row-text" }, h("span", { class: "row-name" }, label), h("span", { class: "row-sub" }, sub)));
        })));
    }
  }

  // ---- Link the two parents (adding a second parent) ----
  let marry = null;
  let marryEl = null;
  if (kind === "parent" && parents.length === 1) {
    marry = h("input", { type: "checkbox", checked: true });
    marry.addEventListener("change", () => update());
    marryEl = h("label", { class: "choice single" }, marry,
      h("span", { class: "row-text" },
        h("span", { class: "row-name" }, `Married to ${store.fullName(parents[0])}`),
        h("span", { class: "row-sub" }, "Links the two parents as husband and wife")));
  }

  // ---- Someone with this name is already in the tree ----
  const dupBox = h("div", { class: "dup", hidden: true });
  const dismissed = new Set();

  const values = () => ({ first: first.input.value, father: father.input.value, family: family.input.value, gender });

  const linkProblem = (other) =>
    kind === "parent" ? store.checkParentLink(other.id, anchor.id)
    : kind === "child" ? store.checkParentLink(anchor.id, other.id)
    : kind === "spouse" ? store.checkSpouseLink(anchor.id, other.id)
    : null;

  function drawDup() {
    if (kind === "me") return (dupBox.hidden = true);
    const match = store.findMatches(values()).find((m) => m.id !== anchor.id && !dismissed.has(m.id));
    if (!match) return (dupBox.hidden = true);
    const problem = linkProblem(match);
    const desc = [store.parentsLabel(match), relLabel(match.id), problem].filter(Boolean).join(" · ");
    dupBox.hidden = false;
    dupBox.replaceChildren(
      kicker("Already in the tree"),
      h("p", { class: "dup-name" }, store.fullName(match)),
      desc && h("p", { class: "row-sub" }, desc),
      h("p", {}, problem ? "They cannot be linked this way." : "Is this the same person? Link them instead of adding a copy."),
      h("div", { class: "dup-actions" },
        !problem && h("button", { type: "button", class: "btn", onclick: () => save(match.id) }, `Link to ${match.first}`),
        h("button", { type: "button", class: "text-btn", onclick: () => { dismissed.add(match.id); drawDup(); } }, "No, someone else")));
  }

  // ---- Suggested names, from what the tree already knows ----
  function setIfUntouched(f, value) {
    if (!touched.has(f.input.name)) f.input.value = value || "";
  }
  function suggest() {
    if (kind === "child") {
      // A child takes the father's first name and family name.
      const dad = anchor.gender === "f" ? store.getPerson(otherParent) : anchor;
      setIfUntouched(father, dad?.gender !== "f" ? dad?.first : "");
      setIfUntouched(family, dad?.gender !== "f" ? dad?.family : "");
      groupHint.textContent = dad && dad.gender !== "f" ? `Filled in from ${dad.first}’s name. Change them if needed.` : "";
    } else if (kind === "parent") {
      // A father's first name is the child's father's name.
      const isFather = gender === "m";
      setIfUntouched(first, isFather ? anchor.father : "");
      setIfUntouched(family, isFather ? anchor.family : "");
      first.hint.textContent = isFather && anchor.father ? `From ${anchor.first}’s name: ${anchorName}.` : "";
      father.hint.textContent = "Leave it blank if you don’t know it.";
    }
  }

  // ---- How they will relate to you, before saving ----
  const relWords = h("p", { class: "relate-words" });
  const relSide = h("p", { class: "person-side" });
  const relateBox = kind === "me" ? null
    : h("div", { class: "relate" }, kicker("How they’ll relate to you"), relWords, relSide);

  function drawRelate() {
    if (!relateBox) return;
    // A copy of the tree with the new person in it, linked the way Save would link them.
    const data = store.getData();
    const id = "new-person";
    const d = {
      ...data,
      people: { ...data.people, [id]: { id, first: first.input.value.trim(), father: "", family: "", gender } },
      parents: [...data.parents],
      spouses: [...data.spouses],
    };
    if (kind === "parent") {
      d.parents.push({ parent: id, child: anchor.id });
      if (marry?.checked) d.spouses.push({ a: parents[0].id, b: id, former: false });
    } else if (kind === "child") {
      d.parents.push({ parent: anchor.id, child: id });
      if (otherParent) d.parents.push({ parent: otherParent, child: id });
    } else {
      d.spouses.push({ a: anchor.id, b: id, former });
    }
    const rel = relToMe(id, d);
    relWords.textContent = rel.kind === "none" ? "Not linked to you" : "Your " + rel.words;
    relSide.textContent = sideText(rel.via, d);
  }

  // ---- Title, save button and what it says ----
  const titles = { me: "Add yourself", parent: "Add a parent", child: "Add a child", spouse: "Add a spouse" };
  const saveBtn = h("button", { type: "submit", class: "btn small", form: "person-form" }, "Add");
  const error = h("p", { class: "error", role: "alert" });

  function update() {
    if (kind === "child") saveBtn.textContent = gender === "f" ? "Add daughter" : "Add son";
    else if (kind === "parent") saveBtn.textContent = gender === "f" ? "Add mother" : "Add father";
    else saveBtn.textContent = "Add";
    saveBtn.disabled = !first.input.value.trim() || !gender;
    drawDup();
    drawRelate();
  }

  const spouseOf = gender === "m" ? "Husband of " : gender === "f" ? "Wife of " : "Spouse of ";
  const context = {
    me: ["You", "Every tree starts with one person"],
    parent: ["New parent", "Parent of " + anchorName],
    child: ["New child", "Child of " + anchorName],
    spouse: ["New spouse", spouseOf + anchorName],
  }[kind];

  // ---- Saving ----
  function save(existingId) {
    error.textContent = "";
    try {
      const newId = store.change(() => {
        const id = existingId || store.addPerson(values()).id;
        if (kind === "me") store.setMe(id);
        else if (kind === "parent") {
          store.linkParent(id, anchor.id);
          if (marry?.checked && !store.checkSpouseLink(id, parents[0].id)) store.linkSpouse(parents[0].id, id);
        } else if (kind === "child") {
          store.linkParent(anchor.id, id);
          if (otherParent && !store.checkParentLink(otherParent, id)) store.linkParent(otherParent, id);
        } else store.linkSpouse(anchor.id, id, former);
        return id;
      }, (id) => {
        const name = store.fullName(store.getPerson(id));
        if (kind === "me") return { message: "You were added. Welcome to your tree." };
        if (existingId) return { message: `${name} was linked to ${anchor.first}.` };
        return { message: `${name} was added.` };
      });
      closeSheet();
      if (kind !== "me") {
        // Someone added inside a folded branch: open it, so they show.
        if (chart && newId && !chart.has(newId)) revealPerson(newId);
        showPerson(anchor.id, { move: false });
      }
    } catch (err) {
      error.textContent = err.message;
    }
  }

  const form = h("form", { id: "person-form", class: "person-form" },
    segment, spouseGenderSeg,
    first.el, father.el, family.el, groupHint,
    otherParentEl, marryEl,
    dupBox,
    relateBox,
    error);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!saveBtn.disabled) save(null);
  });

  openSheet(h("div", {},
    h("div", { class: "form-bar" },
      h("button", { type: "button", class: "text-btn plain", onclick: closeSheet }, "Cancel"),
      h("h2", { class: "form-title" }, titles[kind]),
      saveBtn),
    kicker(context[0]),
    h("p", { class: "context" }, context[1]),
    form));

  suggest();
  update();
}

// ---- Start ----

store.onChange(renderHome);
renderHome();

document.getElementById("menu-btn").addEventListener("click", backup.showMenu);
// Search: the person picked opens on the chart, even inside a folded branch.
search.init((id) => {
  if (chart) showPerson(id, { centre: true });
});
undo.init();
backup.init({
  // A new tree came in from a file: draw it fresh and centre on "me".
  onImported: () => {
    if (panel) panel.hidden = true;
    fold.expandAll();
    chart = null;
    panelId = null;
    renderHome();
  },
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
