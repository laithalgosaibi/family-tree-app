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
  sheetBody.replaceChildren(content);
  if (!sheet.open) sheet.showModal();
  sheetBody.scrollTop = 0;
}

function closeSheet() {
  sheet.close();
}

sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeSheet(); // tap outside the card closes it
});

// ---- Home screen ----

function renderHome() {
  const me = store.getMe();
  if (!me) return renderWelcome();

  const others = store.allPeople().filter((p) => p.id !== me.id).sort(byName);

  main.replaceChildren(
    h("p", { class: "note" },
      "The family chart comes in the next step. For now, everyone you add is listed here. Tap a person to add their parents, spouses and children."),
    h("h2", { class: "section-title" }, "You"),
    h("ul", { class: "people" }, personRow(me)),
    h("h2", { class: "section-title" }, `Family (${others.length})`),
    others.length
      ? h("ul", { class: "people" }, others.map(personRow))
      : h("p", { class: "empty" }, "No one yet. Tap your name above to add your parents.")
  );
}

function personRow(p) {
  const sub = store.parentsLabel(p);
  return h("li", {},
    h("button", { class: "person-row", onclick: () => showPerson(p.id) },
      h("span", { class: "avatar", "aria-hidden": "true" }, p.first.charAt(0).toUpperCase()),
      h("span", { class: "person-text" },
        h("span", { class: "person-name" }, store.fullName(p)),
        sub && h("span", { class: "person-sub" }, sub)),
      h("span", { class: "chevron", "aria-hidden": "true" }, "›")));
}

// ---- First run: add yourself ----

function renderWelcome() {
  const form = nameForm({
    submitLabel: "Start my tree",
    onSubmit(values) {
      store.change(() => {
        const me = store.addPerson(values);
        store.setMe(me.id);
      });
    },
  });
  main.replaceChildren(
    h("div", { class: "welcome card" },
      h("h2", {}, "Start with yourself"),
      h("p", {}, "Your tree grows out from you. Add your own name first, then your parents, spouse and children."),
      form));
  store.askToKeepData();
}

// ---- A person ----

function showPerson(id) {
  const p = store.getPerson(id);
  if (!p) return closeSheet();
  const isMe = p.id === store.getMe()?.id;
  const parents = store.parentsOf(id);
  const spouses = store.spousesOf(id);
  const children = store.childrenOf(id);

  const group = (title, list, emptyText) =>
    h("div", { class: "group" },
      h("h3", {}, title),
      list.length
        ? h("div", { class: "chips" }, list.sort(byName).map((x) =>
            h("button", { class: "chip", onclick: () => showPerson(x.id) }, store.fullName(x))))
        : h("p", { class: "empty" }, emptyText));

  openSheet(h("div", {},
    h("div", { class: "sheet-head" },
      h("div", {},
        isMe && h("span", { class: "tag" }, "You"),
        h("h2", {}, store.fullName(p))),
      h("button", { class: "icon-btn", "aria-label": "Close", onclick: closeSheet }, "×")),
    group("Parents", parents, "No parents added yet."),
    group(spouses.length > 1 ? "Spouses" : "Spouse", spouses, "No spouse added yet."),
    group("Children", children, "No children added yet."),
    h("div", { class: "actions" },
      h("button", {
        class: "btn",
        disabled: parents.length >= 2,
        onclick: () => showAdd("parent", id),
      }, "Add parent"),
      h("button", { class: "btn", onclick: () => showAdd("spouse", id) }, "Add spouse"),
      h("button", { class: "btn", onclick: () => showAdd("child", id) }, "Add child")),
    parents.length >= 2 && h("p", { class: "hint" }, "Both parents have been added.")));
}

// ---- Adding a parent, spouse or child ----

const KIND_TEXT = {
  parent: (name) => `Add a parent of ${name}`,
  spouse: (name) => `Add a spouse of ${name}`,
  child: (name) => `Add a child of ${name}`,
};

function showAdd(kind, personId, mode = "new") {
  const p = store.getPerson(personId);
  const tabs = h("div", { class: "tabs", role: "tablist" },
    h("button", { class: "tab", role: "tab", "aria-selected": String(mode === "new"), onclick: () => showAdd(kind, personId, "new") }, "New person"),
    h("button", { class: "tab", role: "tab", "aria-selected": String(mode === "existing"), onclick: () => showAdd(kind, personId, "existing") }, "Already in the tree"));

  const error = h("p", { class: "error", role: "alert" });
  const extras = linkExtras(kind, p);

  const save = (getOtherId) => {
    try {
      store.change(() => {
        const otherId = getOtherId();
        connect(kind, p.id, otherId, extras.read());
      });
      showPerson(p.id);
    } catch (err) {
      error.textContent = err.message;
    }
  };

  const body = mode === "new"
    ? nameForm({
        submitLabel: "Save",
        prefill: prefillFor(kind, p),
        fillAsFather: kind === "parent" && p.father ? { first: p.father, family: p.family } : null,
        before: extras.el,
        onSubmit: (values) => save(() => store.addPerson(values).id),
      })
    : existingPicker(kind, p, extras.el, (otherId) => save(() => otherId));

  openSheet(h("div", {},
    h("div", { class: "sheet-head" },
      h("button", { class: "icon-btn", "aria-label": "Back", onclick: () => showPerson(personId) }, "‹"),
      h("h2", {}, KIND_TEXT[kind](p.first)),
      h("button", { class: "icon-btn", "aria-label": "Close", onclick: closeSheet }, "×")),
    tabs,
    body,
    error));
}

// Makes the actual links once the other person is known.
function connect(kind, personId, otherId, extra) {
  if (kind === "parent") {
    store.linkParent(otherId, personId);
    if (extra.spouseOf && !store.spousesOf(otherId).some((s) => s.id === extra.spouseOf)) {
      store.linkSpouse(otherId, extra.spouseOf);
    }
  } else if (kind === "child") {
    store.linkParent(personId, otherId);
    if (extra.otherParent) store.linkParent(extra.otherParent, otherId);
  } else {
    store.linkSpouse(personId, otherId);
  }
}

// Extra questions that save typing later:
//  - adding a child: who is the other parent?
//  - adding a second parent: are the two parents married?
function linkExtras(kind, p) {
  if (kind === "child") {
    const spouses = store.spousesOf(p.id).sort(byName);
    if (!spouses.length) return { el: null, read: () => ({}) };
    const select = h("select", { id: "other-parent" },
      spouses.map((s) => h("option", { value: s.id }, store.fullName(s))),
      h("option", { value: "" }, "Not known or not added yet"));
    return {
      el: h("label", { class: "field" }, h("span", {}, "Other parent"), select),
      read: () => ({ otherParent: select.value || null }),
    };
  }
  if (kind === "parent") {
    const existing = store.parentsOf(p.id)[0];
    if (!existing) return { el: null, read: () => ({}) };
    const box = h("input", { type: "checkbox", id: "link-spouse", checked: true });
    return {
      el: h("label", { class: "check" }, box, h("span", {}, `Also link as spouse of ${store.fullName(existing)}`)),
      read: () => ({ spouseOf: box.checked ? existing.id : null }),
    };
  }
  return { el: null, read: () => ({}) };
}

function prefillFor(kind, p) {
  // In Arab naming, a child's father's name is the father's first name,
  // and the family name carries down. Easy to change if it is the mother.
  if (kind === "child") return { father: p.first, family: p.family };
  return {};
}

// Pick someone who is already in the tree.
function existingPicker(kind, p, extrasEl, onPick) {
  const check = (other) =>
    kind === "parent" ? store.checkParentLink(other.id, p.id)
    : kind === "child" ? store.checkParentLink(p.id, other.id)
    : store.checkSpouseLink(p.id, other.id);

  const candidates = store.allPeople().filter((x) => x.id !== p.id).sort(byName);
  const list = h("ul", { class: "people compact" });
  const search = h("input", { type: "search", placeholder: "Type a name", "aria-label": "Search by name", autocomplete: "off" });

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = candidates.filter((x) => !q || store.fullName(x).toLowerCase().includes(q));
    list.replaceChildren(...(shown.length
      ? shown.map((x) => {
          const problem = check(x);
          const sub = problem || store.parentsLabel(x);
          return h("li", {},
            h("button", { class: "person-row", disabled: !!problem, onclick: () => onPick(x.id) },
              h("span", { class: "person-text" },
                h("span", { class: "person-name" }, store.fullName(x)),
                sub && h("span", { class: "person-sub" }, sub))));
        })
      : [h("li", { class: "empty" }, candidates.length ? "No one matches that name." : "There is no one else in the tree yet.")]));
  };
  search.addEventListener("input", draw);
  draw();

  return h("div", { class: "picker" }, extrasEl, search, list);
}

// ---- The name form, used for every new person ----

function nameForm({ submitLabel, onSubmit, prefill = {}, fillAsFather = null, before = null }) {
  const field = (name, label, placeholder) =>
    h("label", { class: "field" },
      h("span", {}, label),
      h("input", { name, value: prefill[name] || "", placeholder, autocomplete: "off", autocapitalize: "words", spellcheck: "false" }));

  const form = h("form", { class: "name-form" },
    before,
    fillAsFather && h("button", {
      type: "button", class: "link-btn",
      onclick: () => {
        form.elements.first.value = fillAsFather.first;
        form.elements.family.value = fillAsFather.family;
        form.elements.father.focus();
      },
    }, `This is the father: fill in ${fillAsFather.first} ${fillAsFather.family}`),
    field("first", "First name", "e.g. Laith"),
    field("father", "Father's name", "e.g. Ahmed"),
    field("family", "Family name", "e.g. Algosaibi"),
    h("p", { class: "error", role: "alert" }),
    h("button", { type: "submit", class: "btn primary" }, submitLabel));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const error = form.querySelector(".error");
    if (!values.first.trim()) {
      error.textContent = "Please add a first name.";
      form.elements.first.focus();
      return;
    }
    try {
      onSubmit(values);
    } catch (err) {
      error.textContent = err.message;
    }
  });
  return form;
}

// ---- Start ----

store.onChange(renderHome);
renderHome();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
