// undo.js
// The message at the bottom after every change, with its Undo button.
// It stays for 10 seconds and the gold line shows the time left.
// On the Mac, ⌘Z also undoes. The ··· menu has "Undo last change" for later.

import * as store from "./store.js";
import { h } from "./ui.js";

const SHOW_FOR = 10000; // with an Undo button
const SHOW_SHORT = 4000; // just saying what happened

let toast = null;
let timer = null;

export function init() {
  store.onHistory((note) => show(note, true));

  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
    if (e.target.closest?.("input, textarea") || document.querySelector("dialog[open]")) return;
    e.preventDefault();
    undoLast();
  });
}

export function undoLast() {
  const note = store.undo();
  if (!note) return show({ message: "Nothing to undo." }, false);
  show({ message: "Undone.", detail: "Taken back: " + note.message }, false);
}

function show({ message, detail }, withUndo) {
  hide();
  const ms = withUndo ? SHOW_FOR : SHOW_SHORT;
  toast = h("div", { class: "toast", role: "status" },
    h("div", { class: "toast-text" },
      h("p", { class: "toast-message" }, message),
      detail && h("p", { class: "toast-detail" }, detail)),
    withUndo && h("button", { class: "btn small", onclick: undoLast }, "Undo"),
    h("span", { class: "toast-time", style: `animation-duration: ${ms}ms`, "aria-hidden": "true" }));
  document.body.append(toast);
  timer = setTimeout(hide, ms);
}

function hide() {
  clearTimeout(timer);
  toast?.remove();
  toast = null;
}
