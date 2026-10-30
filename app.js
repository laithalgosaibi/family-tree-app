// app.js
// The screens of the app. Data lives in store.js.

import * as store from "./store.js";

const main = document.getElementById("main");
const sheet = document.getElementById("sheet");
const sheetBody = document.getElementById("sheet-body");

// ---- Small helpers ----

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(child));
  }
  return el;
}

function byName(a, b) {
  return store.fullName(a).localeCompare(store.fullName(b));
}

function openSheet(content) {
  sheetBody.replaceChildren(h("div", { class: "grabber", "aria-hidden": "true" }), content);
  if (!sheet.open) sheet.showModal();
  sheetBody.scrollTop = 0;
}

function closeSheet() {
  sheet.close();
}

sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeSheet(); // tap outside the card closes it
});

const kicker = (text) => h("p", { class: "kicker" }, text);

// Words for one relative, shown under their name in a list.
function parentWord(p) {
  return p.gender === "m" ? "Father" : p.gender === "f" ? "Mother" : "Parent";
}
function childWord(p) {
  return p.gender === "m" ? "Son" : p.gender === "f" ? "Daughter" : "Child";
}

// ---- Home screen ----

function renderHome() {
  const me = store.getMe();
  if (!me) return renderFirstOpen();

  const others = store.allPeople().filter((p) => p.id !== me.id).sort(byName);

  main.replaceChildren(
    h("p", { class: "note" },
      "The family chart comes in the next step. For now, everyone you add is listed here. Tap a person to add their parents, spouses and children."),
    h("h2", { class: "section-title" }, "You"),
    h("ul", { class: "rows" }, personRow(me, store.parentsLabel(me))),
    h("h2", { class: "section-title" }, `Family · ${others.length}`),
    others.length
      ? h("ul", { class: "rows" }, others.map((p) => personRow(p, store.parentsLabel(p))))
      : h("p", { class: "empty" }, "No one yet. Tap your name above to add your parents."));
}

function personRow(p, sub) {
  return h("li", {},
    h("button", { class: "row", onclick: () => showPerson(p.id) },
      h("span", { class: "row-text" },
        h("span", { class: "row-name" }, store.fullName(p)),
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
        h("button", { class: "btn wide", onclick: () => showForm("me") }, "Add yourself"))));
  store.askToKeepData();
}

// ---- A person's card ----

function showPerson(id) {
  const p = store.getPerson(id);
  if (!p) return closeSheet();
  const isMe = p.id === store.getMe()?.id;
  const parents = store.parentsOf(id);
  const spouses = store.spousesOf(id);
  const children = store.childrenOf(id).sort(byName);

  const group = (title, list, word) =>
    h("section", { class: "group" },
      h("h3", { class: "group-title" }, title),
      list.length
        ? h("ul", { class: "rows plain" }, list.map((x) => personRow(x, word(x))))
        : h("p", { class: "empty" }, `No ${title.toLowerCase()} added yet.`));

  openSheet(h("div", {},
    h("div", { class: "card-top" },
      h("span", {}),
      h("button", { class: "icon-btn", "aria-label": "Close", onclick: closeSheet }, "×")),
    isMe && kicker("You"),
    h("h2", { class: "person-name" }, store.fullName(p)),
    parents.length > 0 && h("p", { class: "person-parents" }, store.parentsLabel(p, { full: true })),
    h("div", { class: "actions" },
      h("button", { class: "action", disabled: parents.length >= 2, onclick: () => showForm("parent", id) },
        h("span", { class: "action-icon", "aria-hidden": "true" }, "↑"), "Add parent"),
      h("button", { class: "action", onclick: () => showForm("child", id) },
        h("span", { class: "action-icon", "aria-hidden": "true" }, "↓"), "Add child"),
      h("button", { class: "action", onclick: () => showForm("spouse", id) },
        h("span", { class: "action-icon", "aria-hidden": "true" }, "↔"), "Add spouse")),
    parents.length >= 2 && h("p", { class: "hint" }, "Both parents are added."),
    group("Parents", parents, parentWord),
    group(spouses.length > 1 ? "Spouses" : "Spouse", spouses, (s) => store.spouseWord(id, s.id)),
    group("Children", children, (c) => store.parentsLabel(c) || childWord(c))));
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
          input.addEventListener("change", () => { otherParent = value || null; suggest(); });
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
    const desc = [store.parentsLabel(match), problem].filter(Boolean).join(" · ");
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
      store.change(() => {
        const id = existingId || store.addPerson(values()).id;
        if (kind === "me") store.setMe(id);
        else if (kind === "parent") {
          store.linkParent(id, anchor.id);
          if (marry?.checked && !store.checkSpouseLink(id, parents[0].id)) store.linkSpouse(parents[0].id, id);
        } else if (kind === "child") {
          store.linkParent(anchor.id, id);
          if (otherParent && !store.checkParentLink(otherParent, id)) store.linkParent(otherParent, id);
        } else store.linkSpouse(anchor.id, id, former);
      });
      if (kind === "me") closeSheet();
      else showPerson(anchor.id);
    } catch (err) {
      error.textContent = err.message;
    }
  }

  const form = h("form", { id: "person-form", class: "person-form" },
    segment, spouseGenderSeg,
    first.el, father.el, family.el, groupHint,
    otherParentEl, marryEl,
    dupBox,
    error);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!saveBtn.disabled) save(null);
  });

  openSheet(h("div", {},
    h("div", { class: "form-bar" },
      h("button", { type: "button", class: "text-btn plain", onclick: () => (anchor ? showPerson(anchor.id) : closeSheet()) }, "Cancel"),
      h("h2", { class: "form-title" }, titles[kind]),
      saveBtn),
    kicker(context[0]),
    h("p", { class: "context" }, context[1]),
    form));

  suggest();
  update();
}

// A row of two buttons where one is picked, like Son | Daughter.
function makeSegment(label, options, picked, onPick, disabledValues = []) {
  const buttons = options.map(([value, text]) =>
    h("button", {
      type: "button",
      class: "seg",
      "aria-pressed": String(value === picked),
      disabled: disabledValues.includes(value),
      onclick: () => {
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === buttons[options.findIndex(([v]) => v === value)])));
        onPick(value);
      },
    }, text));
  return h("div", { class: "field" },
    h("span", { class: "field-label" }, label),
    h("div", { class: "segment" }, buttons));
}

// ---- Start ----

store.onChange(renderHome);
renderHome();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
