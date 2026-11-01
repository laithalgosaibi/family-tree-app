// backup.js
// Export the tree to a file, import it back, and remind to make a backup.
//
// Why this matters: the tree is saved only in this browser on this device.
// A ".family" file is the only copy that lives anywhere else, and it is how the
// tree moves between the iPhone and the Mac.

import * as store from "./store.js";
import { h, kicker, openSheet, closeSheet, sheet, icon } from "./ui.js";
import { undoLast } from "./undo.js";

const DAY = 24 * 60 * 60 * 1000;
const touch = window.matchMedia("(hover: none) and (pointer: coarse)");
const wide = window.matchMedia("(min-width: 700px)");

const downloadIcon = () => icon('<path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M3.5 15.5v1.5h13v-1.5"/>');
const treeIcon = () => icon('<circle cx="10" cy="4.5" r="2"/><circle cx="5" cy="15.5" r="2"/><circle cx="15" cy="15.5" r="2"/>'
  + '<path d="M10 6.5v4M5 13.5v-3h10v3"/>', "icon file-icon");

let afterImport = () => {};

export function init({ onImported }) {
  afterImport = onImported;
  // The reminder waits until any open form is closed.
  sheet.addEventListener("close", () => setTimeout(checkReminder, 300));
  store.onChange(() => setTimeout(checkReminder, 300));
  setTimeout(checkReminder, 800);
}

// ---- Words used on several screens ----

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  return "this device";
}
const onThis = () => (deviceName() === "this device" ? "on this device" : "on this " + deviceName());

const longDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const shortDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const people = (n) => (n === 1 ? "1 person" : `${n} people`);

function familyName() {
  return store.getMe()?.family || "";
}

function fileName() {
  const family = familyName().replace(/[\\/:*?"<>|]/g, "").trim();
  return `${family ? family + " family" : "Family tree"} ${shortDate(Date.now())}.family`;
}

function lastBackupText() {
  const info = store.backupInfo();
  const changes = info.changes ? ` ${plural(info.changes, "change")} since then.` : " No changes since then.";
  if (info.lastBackup) return `Last backup ${longDate(info.lastBackup)}.${changes}`;
  return `No backup yet. Your tree exists only ${onThis()}.`;
}

// ---- The ··· menu ----

export function showMenu() {
  const hasTree = !!store.getMe();
  const last = store.lastChange();
  const item = (title, sub, onclick, disabled) =>
    h("li", {},
      h("button", { class: "row", onclick, disabled },
        h("span", { class: "row-text" },
          h("span", { class: "row-name" }, title),
          h("span", { class: "row-sub" }, sub)),
        h("span", { class: "chevron", "aria-hidden": "true" }, "›")));
  openSheet(h("div", {},
    h("div", { class: "form-bar" },
      h("button", { type: "button", class: "text-btn plain", onclick: closeSheet }, "Close"),
      h("h2", { class: "form-title" }, "Menu"),
      h("span", {})),
    h("ul", { class: "rows menu-undo" },
      item("Undo last change", last ? last.message : "Nothing to undo yet",
        () => { closeSheet(); undoLast(); }, !last)),
    h("p", { class: "label-caps menu-caps" }, "Backups"),
    hasTree && h("p", { class: "context" }, lastBackupText()),
    h("ul", { class: "rows" },
      item("Export a backup", "Save the whole tree to a file", showExport, !hasTree),
      item("Import a file", "Open a .family backup from this app", pickFile))));
}

// ---- Export ----

export function showExport() {
  const me = store.getMe();
  if (!me) return;
  const count = store.allPeople().length;
  const name = fileName();
  const error = h("p", { class: "error", role: "alert" });
  const saveBtn = h("button", { class: "btn wide with-icon", onclick: () => doExport(name, error) },
    downloadIcon(), touch.matches ? "Save to Files…" : "Download file");

  openSheet(h("div", {},
    h("div", { class: "form-bar" },
      h("button", { type: "button", class: "text-btn plain", onclick: closeSheet }, "Cancel"),
      h("h2", { class: "form-title" }, "Export a backup"),
      h("span", {})),
    kicker(`${familyName() ? familyName() + " family · " : ""}${people(count)}`),
    h("p", { class: "context" }, lastBackupText()),
    h("div", { class: "field" },
      h("span", { class: "field-label" }, "Format"),
      h("div", { class: "format picked" },
        h("span", { class: "radio-dot", "aria-hidden": "true" }),
        h("span", { class: "row-text" },
          h("span", { class: "row-name" }, "Family file ", h("span", { class: "ext" }, ".family")),
          h("span", { class: "row-sub" }, "Everything: people and links. Imports back into this app on any device.")))),
    h("div", { class: "file-name" },
      h("p", { class: "label-caps" }, "File name"),
      h("p", { class: "file-name-text" }, name)),
    saveBtn,
    error,
    h("p", { class: "hint center" }, touch.matches
      ? "Choose “Save to Files” and pick iCloud Drive, so the file is safe even if this phone is lost."
      : "The file goes to your Downloads folder. Keep a copy in iCloud Drive to open it on your iPhone.")));
}

// Saves the file. On iPhone this opens the share sheet (with "Save to Files");
// on the Mac it downloads straight to the Downloads folder.
async function doExport(name, error) {
  error.textContent = "";
  const text = store.exportText(deviceName());
  const blob = new Blob([text], { type: "application/json" });

  if (touch.matches && navigator.canShare) {
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return exported(name, true);
      } catch (err) {
        if (err.name === "AbortError") return; // closed the share sheet without saving
        // Anything else: fall through and download it instead.
      }
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    exported(name, false);
  } catch {
    error.textContent = "The file could not be saved. Try again.";
  }
}

function exported(name, shared) {
  store.markBackedUp();
  hideBar();
  openSheet(h("div", { class: "done" },
    kicker("Backup saved"),
    h("h2", { class: "done-title" }, "Your tree is in a file"),
    h("p", { class: "file-name-text" }, name),
    h("p", { class: "context" }, shared
      ? "Keep it somewhere safe, like iCloud Drive. To open the tree on your Mac, use Import a file there."
      : deviceName() === "iPhone"
        ? "It is in the Downloads folder of the Files app. To open the tree on your Mac, use Import a file there."
        : "It is in your Downloads folder. To open the tree on your iPhone, use Import a file there."),
    h("button", { class: "btn wide", onclick: closeSheet }, "Done")));
}

// ---- Import ----

// Opens the file picker. On iPhone this shows the Files app.
export function pickFile() {
  const input = h("input", { type: "file", hidden: true });
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    let parsed;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("This file is too big to be a family tree backup.");
      parsed = store.readFile(await file.text());
    } catch (err) {
      return showImportError(file.name, err.message);
    }
    showImportConfirm(file.name, parsed);
  });
  document.body.append(input); // Safari only opens the picker for inputs on the page
  input.click();
}

function fileCard(name, sub) {
  return h("div", { class: "file-card" },
    h("span", { class: "file-card-icon" }, treeIcon()),
    h("span", { class: "row-text" },
      h("span", { class: "file-card-name" }, name),
      sub && h("span", { class: "row-sub" }, sub)));
}

function showImportError(name, message) {
  openSheet(h("div", {},
    h("div", { class: "form-bar" },
      h("button", { type: "button", class: "text-btn plain", onclick: closeSheet }, "Cancel"),
      h("h2", { class: "form-title" }, "Import a file"),
      h("span", {})),
    fileCard(name),
    h("p", { class: "error big" }, message),
    h("p", { class: "context" }, "Nothing has changed in your tree."),
    h("button", { class: "btn wide", onclick: pickFile }, "Choose another file")));
}

function showImportConfirm(name, parsed) {
  const hereCount = store.allPeople().length;
  const hasTree = !!store.getMe() && hereCount > 0;
  const info = store.backupInfo();
  const from = [parsed.device && `Exported from ${parsed.device === "this device" ? "another device" : (/^i/.test(parsed.device) ? "an " : "a ") + parsed.device}`,
    parsed.exportedAt && shortDate(parsed.exportedAt),
    people(parsed.count)].filter(Boolean).join(" · ");

  const replace = () => {
    store.replaceTree(parsed.tree);
    closeSheet();
    afterImport();
  };

  if (!hasTree) {
    return openSheet(h("div", {},
      h("div", { class: "form-bar" },
        h("button", { type: "button", class: "text-btn plain", onclick: closeSheet }, "Cancel"),
        h("h2", { class: "form-title" }, "Import a file"),
        h("span", {})),
      fileCard(name, from),
      h("p", { class: "context" }, `The ${people(parsed.count)} in this file will be your tree ${onThis()}.`),
      h("button", { class: "btn wide", onclick: replace }, "Open this tree")));
  }

  // There is already a tree here. Importing replaces it, so make that very clear
  // and offer to save a copy of it first.
  const copyStatus = h("p", { class: "hint" });
  const copyBtn = h("button", { class: "btn wide with-icon" }, downloadIcon(), "Save a copy of my tree first");
  copyBtn.addEventListener("click", async () => {
    const text = store.exportText(deviceName());
    const blob = new Blob([text], { type: "application/json" });
    const fname = fileName().replace(/\.family$/, " (before import).family");
    try {
      if (touch.matches && navigator.canShare) {
        const file = new File([blob], fname, { type: "application/json" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          copyStatus.textContent = "Copy saved. You can now replace your tree.";
          copyBtn.disabled = true;
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = h("a", { href: url, download: fname, hidden: true });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      copyStatus.textContent = "Copy saved to Downloads. You can now replace your tree.";
      copyBtn.disabled = true;
    } catch (err) {
      if (err.name !== "AbortError") copyStatus.textContent = "The copy could not be saved. Try again.";
    }
  });

  const unsaved = info.changes > 0
    ? h("p", { class: "warn" }, `${plural(info.changes, "change")} on this ${deviceName() === "this device" ? "device" : deviceName()} ${info.changes === 1 ? "is" : "are"} not in any backup yet.`)
    : null;

  openSheet(h("div", {},
    h("div", { class: "form-bar" },
      h("button", { type: "button", class: "text-btn plain", onclick: closeSheet }, "Cancel"),
      h("h2", { class: "form-title" }, "Import a file"),
      h("span", {})),
    fileCard(name, from),
    h("div", { class: "replace-box" },
      kicker("This replaces your tree"),
      h("p", {}, `Your ${people(hereCount)} ${onThis()} will be swapped for the ${people(parsed.count)} in this file. This cannot be undone.`),
      unsaved),
    copyBtn,
    copyStatus,
    h("button", { class: "btn wide danger", onclick: () => confirmReplace(replace, hereCount) }, "Replace my tree"),
    h("p", { class: "hint center" }, "Joining two trees together, instead of replacing, comes in a later version.")));
}

// One last check, because this cannot be undone.
function confirmReplace(replace, hereCount) {
  const ok = window.confirm(`Replace your ${people(hereCount)} with the tree in this file?`);
  if (ok) replace();
}

// ---- The backup reminder ----
// Once a week (if anything changed) or after 10 changes, whichever comes first.
// On iPhone it slides up as a sheet; on the Mac it is a bar under the title.

const bar = document.getElementById("reminder-bar");

function reminderWords() {
  const info = store.backupInfo();
  const now = Date.now();
  const since = info.lastBackup || info.firstChange || now;
  const days = Math.floor((now - since) / DAY);
  let headline;
  if (!info.lastBackup) headline = "No backup yet";
  else if (days >= 7) headline = `${plural(days, "day")} since the last backup`;
  else headline = `${plural(info.changes, "change")} since the last backup`;
  const body = info.lastBackup
    ? `Since ${longDate(info.lastBackup)} you’ve made ${plural(info.changes, "change")}. They exist only ${onThis()} until you export.`
    : `You’ve made ${plural(info.changes, "change")}. Your tree exists only ${onThis()} until you export.`;
  return { headline, body };
}

function checkReminder() {
  if (sheet.open || !bar.hidden || !store.reminderDue()) return;
  store.snoozeReminder(); // whatever happens next, do not ask again until tomorrow
  const { headline, body } = reminderWords();
  if (wide.matches) return showBar(headline, body);
  openSheet(h("div", { class: "reminder" },
    kicker(headline),
    h("h2", { class: "done-title" }, "Time to save a copy"),
    h("p", { class: "context" }, body),
    h("button", { class: "btn wide", onclick: showExport }, "Export now"),
    h("button", { class: "text-btn plain center-btn", onclick: closeSheet }, "Not now")));
}

function showBar(headline, body) {
  bar.replaceChildren(
    downloadIcon(),
    h("p", { class: "bar-text" }, h("strong", {}, headline + ". "), body),
    h("button", { class: "text-btn", onclick: hideBar }, "Not now"),
    h("button", { class: "btn small", onclick: showExport }, "Export now"));
  bar.hidden = false;
}

function hideBar() {
  bar.hidden = true;
}
