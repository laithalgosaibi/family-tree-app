// link.js
// Linking a separate branch to the tree: "Link to the tree".
// Pick how the person joins (father of, son of, husband of) and who in the tree,
// and see what changes before saving. One link joins the whole branch.
// Which people are in a branch, and the suggested links, come from branch.js.

import * as store from "./store.js";
import { h, kicker, openSheet, closeSheet, makeSegment, icon } from "./ui.js";
import { relationship, sideWords } from "./kin.js";
import { search, fullName } from "./find.js";
import { branchOf, groups, suggestFor, roleWord } from "./branch.js";

export const linkIcon = () => icon('<path d="M8.5 11.5a3.2 3.2 0 0 0 4.6 0l2.6-2.6a3.2 3.2 0 0 0-4.6-4.6l-1.1 1.1'
  + 'M11.5 8.5a3.2 3.2 0 0 0-4.6 0l-2.6 2.6a3.2 3.2 0 0 0 4.6 4.6l1.1-1.1"/>');
const searchIcon = () => icon('<circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.6 12.6 17 17"/>');

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const he = (p) => (p.gender === "m" ? "he" : p.gender === "f" ? "she" : "they");
const people = (n) => (n === 1 ? "1 person" : `${n} people`);

let afterLink = () => {};

// onLinked(id): the link was saved. `id` is the person who was linked.
export function init({ onLinked }) {
  afterLink = onLinked;
}

// Open the sheet for linking `id` (someone in a separate branch).
// role and otherId pick a suggestion to start with.
export function showLink(id, { role = null, otherId = null } = {}) {
  const data = store.getData();
  const p = data.people[id];
  const branch = branchOf(data, id);
  if (!p || !branch) return;
  const inBranch = new Set(branch.ids);
  const suggestions = suggestFor(data, id);
  const first = suggestions[0];
  let state = {
    role: role || first?.role || "parent",
    otherId: otherId || (role ? null : first?.otherId) || null,
    query: "",
    alsoParent: true,
  };

  // ---- How do they join your tree? ----
  const segment = makeSegment("How do they join your tree?",
    [["parent", cap(roleWord(p, "parent")) + " of"], ["child", cap(roleWord(p, "child")) + " of"], ["spouse", cap(roleWord(p, "spouse")) + " of"]],
    state.role, (v) => {
      state.role = v;
      // A suggestion for another kind of link is no longer picked.
      if (state.otherId && !suggestions.some((s) => s.otherId === state.otherId && s.role === v)) state.otherId = null;
      drawAll();
    });
  segment.classList.add("link-segment");

  // ---- Who in your tree? ----
  const input = h("input", {
    type: "search",
    class: "search-input",
    placeholder: "Search by name",
    "aria-label": "Who in your tree? Search by name",
    autocomplete: "off",
    autocapitalize: "words",
    spellcheck: "false",
    enterkeyhint: "search",
  });
  input.addEventListener("input", () => { state.query = input.value; drawList(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); list.querySelector(".link-pick")?.click(); }
  });
  const list = h("div", { class: "link-list" });
  const changes = h("div", { class: "link-changes" });
  const error = h("p", { class: "error", role: "alert" });
  const linkBtn = h("button", { type: "button", class: "btn wide with-icon link-btn", onclick: save });

  const groupInfo = groups(data);
  const mine = (x) => !!groupInfo.groupOf.get(x)?.isMain;

  // Why `otherId` cannot be linked this way, or null.
  function problem(otherId) {
    if (state.role === "parent") return store.checkParentLink(id, otherId);
    if (state.role === "child") return store.checkParentLink(otherId, id);
    return store.checkSpouseLink(id, otherId);
  }

  function pickRow(otherId, reason) {
    const o = data.people[otherId];
    const rel = relationship(data, data.meId, otherId);
    const relText = rel.kind === "self" ? "You"
      : !data.meId ? (mine(otherId) ? "In the tree" : "In another branch") // nobody is set as you
      : rel.kind === "none" ? "In another branch" : "Your " + rel.words;
    const picked = state.otherId === otherId;
    const why = problem(otherId);
    return h("button", {
      type: "button",
      class: "link-pick" + (picked ? " picked" : ""),
      "aria-pressed": String(picked),
      onclick: () => { state.otherId = picked ? null : otherId; drawAll(); },
    },
    h("span", { class: "radio-dot", "aria-hidden": "true" }),
    h("span", { class: "row-text" },
      h("span", { class: "row-name" }, fullName(o)),
      h("span", { class: "link-rel" + (rel.kind === "none" ? " none" : "") }, relText),
      h("span", { class: "row-sub" }, store.parentsLabel(o) || "Parents not added yet"),
      why ? h("span", { class: "row-sub link-why" }, why) : reason && h("span", { class: "link-reason" }, reason)));
  }

  function drawList() {
    const query = state.query.trim();
    const rows = [];
    if (!query) {
      const fits = suggestions.filter((s) => s.role === state.role);
      if (fits.length) {
        rows.push(h("p", { class: "label-caps link-caps" }, "Suggested"));
        for (const s of fits.slice(0, 3)) rows.push(pickRow(s.otherId, s.reason));
      } else {
        rows.push(h("p", { class: "hint" }, `No suggestions from the names. Search for the person ${p.first} joins.`));
      }
      // Someone picked from a search stays showing.
      if (state.otherId && !fits.some((s) => s.otherId === state.otherId)) rows.push(pickRow(state.otherId));
    } else {
      const found = search(data, query);
      const ids = [...found.named, ...found.other].flatMap((e) => (e.same ? e.items : [e])).map((e) => e.id)
        .filter((x) => !inBranch.has(x));
      // People in your tree first.
      ids.sort((a, b) => mine(b) - mine(a));
      if (!ids.length) rows.push(h("p", { class: "hint" }, `No one outside this branch is called “${query}”.`));
      else for (const x of ids.slice(0, 12)) rows.push(pickRow(x, suggestions.find((s) => s.otherId === x && s.role === state.role)?.reason));
    }
    list.replaceChildren(...rows);
  }

  // The tree as it would be after linking, to say what changes.
  function linkedData() {
    const o = data.people[state.otherId];
    const d = { ...data, parents: [...data.parents], spouses: [...data.spouses] };
    if (state.role === "parent") d.parents.push({ parent: id, child: o.id });
    else if (state.role === "child") d.parents.push({ parent: o.id, child: id });
    else d.spouses.push({ a: o.id, b: id, former: false });
    const extra = otherParent();
    if (extra && state.alsoParent) {
      if (state.role === "parent") d.parents.push({ parent: extra.id, child: o.id });
      else d.parents.push({ parent: extra.id, child: id });
    }
    return d;
  }

  // Linking a father to a child who has no parents yet: his wife can be linked as the mother too.
  // Linking a son to a father: the father's wife can be linked as the mother too.
  function otherParent() {
    if (!state.otherId || state.role === "spouse") return null;
    const [parent, child] = state.role === "parent" ? [id, state.otherId] : [state.otherId, id];
    if (store.parentsOf(child).length) return null;
    const spouses = store.spousesOf(parent).filter((s) => !store.isFormerSpouse(parent, s.id));
    const s = spouses.length === 1 ? spouses[0] : null;
    return s && !store.checkParentLink(s.id, child) ? s : null;
  }

  function drawChanges() {
    const o = state.otherId && data.people[state.otherId];
    const why = o && problem(o.id);
    linkBtn.disabled = !o || !!why;
    linkBtn.replaceChildren(linkIcon(), o ? `Link ${p.first} to ${o.first}` : "Choose who to link to");
    if (!o) return changes.replaceChildren();
    if (why) return changes.replaceChildren(kicker("What changes"), h("p", { class: "error" }, why));

    const d = linkedData();
    const word = roleWord(p, state.role);
    const isMe = o.id === data.meId;
    const rel = relationship(d, d.meId, id);
    let line = `${p.first} becomes ${isMe ? "your" : o.first + "’s"} ${word}`;
    if (!isMe && rel.kind !== "none") line += `, so ${he(p)} ${p.gender ? "is" : "are"} your ${rel.words}`;
    const side = !isMe && rel.kind !== "none" ? sideWords(d, rel.via) : "";

    const otherBranch = branchOf(data, o.id, groupInfo);
    const joins = !otherBranch
      ? (branch.count === 1 ? `${p.first} joins your tree.` : `All ${people(branch.count)} in this branch join your tree.`)
      : `This branch and ${o.first}’s branch become one. It is still not connected to ${data.meId ? "you" : "the rest of the tree"}.`;

    const extra = otherParent();
    let extraEl = null;
    if (extra) {
      const box = h("input", { type: "checkbox", checked: state.alsoParent });
      box.addEventListener("change", () => { state.alsoParent = box.checked; drawChanges(); });
      const child = state.role === "parent" ? o : p;
      extraEl = h("label", { class: "choice single link-also" }, box,
        h("span", { class: "row-text" },
          h("span", { class: "row-name" }, `${fullName(extra)} is ${child.first}’s ${roleWord(extra, "parent")} too`)));
    }
    changes.replaceChildren(
      kicker("What changes"),
      h("p", { class: "link-line" }, line + "."),
      side && h("p", { class: "person-side" }, side),
      h("p", { class: "link-joins" }, joins),
      extraEl);
  }

  function drawAll() {
    drawList();
    drawChanges();
  }

  function save() {
    const o = state.otherId && store.getPerson(state.otherId);
    if (!o) return;
    error.textContent = "";
    const extra = state.alsoParent ? otherParent() : null;
    const joinsMe = !branchOf(data, o.id, groupInfo);
    try {
      store.change(() => {
        if (state.role === "parent") store.linkParent(id, o.id);
        else if (state.role === "child") store.linkParent(o.id, id);
        else store.linkSpouse(o.id, id);
        if (extra) {
          const child = state.role === "parent" ? o.id : id;
          if (!store.checkParentLink(extra.id, child)) store.linkParent(extra.id, child);
        }
      }, {
        message: `${p.first} was linked as ${o.first}’s ${roleWord(p, state.role)}.`,
        detail: joinsMe ? "The branch joined your tree." : "The two branches are now one.",
        offerUndo: true,
      });
      closeSheet();
      afterLink(id);
    } catch (err) {
      error.textContent = err.message;
    }
  }

  openSheet(h("div", { class: "link-sheet" },
    h("div", { class: "form-bar" },
      h("button", { type: "button", class: "text-btn plain", onclick: closeSheet }, "Cancel"),
      h("h2", { class: "form-title" }, "Link to the tree"),
      h("span", {})),
    kicker(data.meId ? "Not yet connected to you" : "Not yet connected"),
    h("p", { class: "dup-name link-name" }, fullName(p)),
    h("p", { class: "row-sub" }, store.parentsLabel(p, { full: true }) || "Parents not added yet"),
    h("p", { class: "row-sub" }, `In a separate branch · ${people(branch.count)}`),
    h("div", { class: "person-form link-form" },
      segment,
      h("div", { class: "field" },
        h("span", { class: "field-label" }, "Who in your tree?"),
        h("label", { class: "search-box" }, searchIcon(), input)),
      list,
      changes,
      linkBtn,
      error)));
  drawAll();
}
