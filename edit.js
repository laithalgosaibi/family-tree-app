// edit.js
// Fixing mistakes: change a person's name, unlink their relatives, and delete them.
// Nothing is changed until Save is pressed, and every change can be undone.

import * as store from "./store.js";
import { h, openSheet, closeSheet, makeSegment, askToConfirm, trashIcon } from "./ui.js";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "his", "her" or "their", from what we know.
function pronouns(p) {
  return p.gender === "m" ? { his: "his", him: "him", His: "His" }
    : p.gender === "f" ? { his: "her", him: "her", His: "Her" }
    : { his: "their", him: "them", His: "Their" };
}

function parentWord(p) {
  return p.gender === "m" ? "Father" : p.gender === "f" ? "Mother" : "Parent";
}
function childWord(p) {
  return p.gender === "m" ? "Son" : p.gender === "f" ? "Daughter" : "Child";
}
function spouseWord(other, former) {
  const word = other.gender === "m" ? "husband" : other.gender === "f" ? "wife" : "spouse";
  return former ? "Former " + word : word.charAt(0).toUpperCase() + word.slice(1);
}

// "2 parents, 1 spouse and 3 children"
function listLinks({ parents, spouses, children }) {
  const parts = [
    parents && plural(parents, "parent", "parents"),
    spouses && plural(spouses, "spouse", "spouses"),
    children && plural(children, "child", "children"),
  ].filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

// ---- The edit sheet ----

export function showEdit(id) {
  const p = store.getPerson(id);
  if (!p) return;
  const isMe = id === store.getMe()?.id;

  let gender = p.gender;
  const removed = new Set(); // links to take away when Save is pressed, as "parent:id", "spouse:id", "child:id"
  const former = new Map(); // spouse id -> true/false, only for marriages whose status was changed

  // ---- Name and gender ----
  const field = (name, label, value) => {
    const input = h("input", { name, value, autocomplete: "off", autocapitalize: "words", spellcheck: "false" });
    input.addEventListener("input", update);
    return { input, el: h("label", { class: "field" }, h("span", { class: "field-label" }, label), input) };
  };
  const first = field("first", "First name", p.first);
  const father = field("father", "Father’s name", p.father);
  const family = field("family", "Family name", p.family);
  const genderSeg = makeSegment(isMe ? "Are you" : "Male or female", [["m", "Male"], ["f", "Female"]], gender,
    (v) => { gender = v; update(); });

  // ---- Their links ----
  // Each row can be unlinked. Spouses can also be marked as former (divorced or widowed).
  function linkRow(key, other, sub) {
    const li = h("li", { class: "link-row" });
    const draw = () => {
      const gone = removed.has(key);
      const isSpouse = key.startsWith("spouse:");
      const wasFormer = isSpouse && store.isFormerSpouse(id, other.id);
      const nowFormer = former.has(other.id) ? former.get(other.id) : wasFormer;
      li.classList.toggle("removed", gone);
      li.replaceChildren(
        h("span", { class: "row-text" },
          h("span", { class: "row-name" }, store.fullName(other)),
          h("span", { class: "row-sub" },
            gone ? "Will be unlinked when you save. They stay in the tree."
              : isSpouse ? spouseWord(other, nowFormer) : sub)),
        h("span", { class: "link-actions" },
          isSpouse && !gone && h("button", {
            type: "button", class: "text-btn small-text",
            onclick: () => {
              if (!nowFormer === wasFormer) former.delete(other.id);
              else former.set(other.id, !nowFormer);
              draw(); update();
            },
          }, nowFormer ? "Mark as married" : "Divorced or widowed"),
          h("button", {
            type: "button", class: "text-btn",
            onclick: () => { gone ? removed.delete(key) : removed.add(key); draw(); update(); },
          }, gone ? "Keep" : "Unlink")));
    };
    draw();
    return li;
  }

  const parents = store.parentsOf(id);
  const spouses = store.spousesOf(id);
  const children = store.childrenOf(id);
  const group = (title, emptyText, rows) =>
    h("section", { class: "group" },
      h("h3", { class: "group-title" }, title),
      rows.length ? h("ul", { class: "rows plain" }, rows) : h("p", { class: "empty" }, emptyText));

  // ---- Save ----
  const saveBtn = h("button", { type: "submit", class: "btn small", form: "edit-form" }, "Save");
  const error = h("p", { class: "error", role: "alert" });

  function update() {
    saveBtn.disabled = !first.input.value.trim();
  }

  function save() {
    error.textContent = "";
    const oldName = store.fullName(p);
    try {
      store.change(() => {
        store.updatePerson(id, { first: first.input.value, father: father.input.value, family: family.input.value, gender });
        for (const key of removed) {
          const [kind, other] = key.split(":");
          if (kind === "parent") store.unlinkParent(other, id);
          else if (kind === "child") store.unlinkParent(id, other);
          else store.unlinkSpouse(id, other);
        }
        for (const [other, value] of former) if (!removed.has("spouse:" + other)) store.setFormer(id, other, value);
      }, () => {
        const now = store.getPerson(id);
        const newName = store.fullName(now);
        const bits = [];
        if (newName !== oldName) bits.push("Name changed");
        if (removed.size) bits.push(plural(removed.size, "link removed", "links removed"));
        if (former.size) bits.push(former.size === 1 ? "Marriage updated" : "Marriages updated");
        return { message: `${newName} was updated.`, detail: bits.join(" · ") || null };
      });
      closeSheet();
    } catch (err) {
      error.textContent = err.message;
    }
  }

  const form = h("form", { id: "edit-form", class: "person-form" },
    first.el, father.el, family.el, genderSeg, error);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!saveBtn.disabled) save();
  });

  openSheet(h("div", {},
    h("div", { class: "form-bar" },
      h("button", { type: "button", class: "text-btn plain", onclick: closeSheet }, "Cancel"),
      h("h2", { class: "form-title" }, "Edit person"),
      saveBtn),
    form,
    group("Parents", "No parents added yet",
      parents.map((x) => linkRow("parent:" + x.id, x, parentWord(x)))),
    group(spouses.length > 1 ? "Spouses" : "Spouse", "No spouse added yet",
      spouses.map((x) => linkRow("spouse:" + x.id, x))),
    group("Children", "No children added yet",
      children.map((x) => linkRow("child:" + x.id, x, store.parentsLabel(x) || childWord(x)))),
    h("p", { class: "hint" }, "To link someone who is already in the tree, close this and use Add parent, Add child or Add spouse, then type their name."),
    isMe
      ? h("p", { class: "hint delete-hint" }, "You are the centre of the tree, so you cannot be deleted. You can still fix your name.")
      : h("button", { type: "button", class: "btn wide danger with-icon delete-btn", onclick: () => confirmDelete(id) },
        trashIcon(), `Delete ${p.first}`)));
  update();
}

// ---- Delete, after saying what else goes ----

export function confirmDelete(id) {
  const p = store.getPerson(id);
  if (!p) return;
  const name = store.fullName(p);
  const { his, him, His } = pronouns(p);
  const counts = store.linkCounts(id);
  const total = counts.parents + counts.spouses + counts.children;
  const cutOff = store.cutOffBy(id);

  const linksText = total
    ? `This also removes ${his} ${total === 1 ? "link" : "links"} to ${listLinks(counts)}. Those people stay in the tree.`
    : `Nobody else is linked to ${him}, so nothing else changes.`;
  const cutOffText = cutOff.length
    ? h("p", { class: "warn" }, cutOff.length === 1
      ? `${store.fullName(cutOff[0])} will no longer be joined to you on the chart. They stay in the tree, off to the side.`
      : `${store.fullName(cutOff[0])} and ${plural(cutOff.length - 1, "other", "others")} will no longer be joined to you on the chart. They stay in the tree, off to the side.`)
    : null;

  askToConfirm({
    title: `Delete ${name}?`,
    body: [linksText, cutOffText, "You can undo this straight after."],
    yes: "Delete",
    onYes: () => {
      closeSheet();
      store.change(() => store.deletePerson(id), {
        message: `${name} was deleted.`,
        detail: total ? `${His} ${plural(total, "link", "links")} went with ${him}.` : null,
      });
    },
  });
}
