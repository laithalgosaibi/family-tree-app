// store.js
// Holds the family tree data and saves it on this device (in the browser).
//
// The tree is stored as:
//   people:  { id: { id, first, father, family, gender } }   gender is "m" or "f"
//   parents: [ { parent, child } ]           one entry per parent-child link
//   spouses: [ { a, b, former } ]            one entry per marriage, in the order added;
//                                            former is true after a divorce or a death
//   meId:    the id of the person the app is centred on (Laith)
// Every other relationship (sibling, cousin, uncle) is worked out from these.

const STORAGE_KEY = "familyTree.v1";

function emptyTree() {
  return { version: 1, people: {}, parents: [], spouses: [], meId: null };
}

let tree = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyTree();
    const data = JSON.parse(raw);
    return { ...emptyTree(), ...data };
  } catch {
    return emptyTree();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  countChange();
  listeners.forEach((fn) => fn());
}

export function onChange(fn) {
  listeners.add(fn);
}

function newId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function clean(text) {
  return (text || "").trim().replace(/\s+/g, " ");
}

// ---- Reading ----

export function getMe() {
  return tree.meId ? tree.people[tree.meId] : null;
}

// The whole tree, for drawing the chart. Read it, do not change it.
export function getData() {
  return tree;
}

export function getPerson(id) {
  return tree.people[id] || null;
}

export function allPeople() {
  return Object.values(tree.people);
}

export function parentsOf(id) {
  return tree.parents.filter((l) => l.child === id).map((l) => tree.people[l.parent]).filter(Boolean);
}

export function childrenOf(id) {
  return tree.parents.filter((l) => l.parent === id).map((l) => tree.people[l.child]).filter(Boolean);
}

export function spousesOf(id) {
  return tree.spouses
    .filter((l) => l.a === id || l.b === id)
    .map((l) => tree.people[l.a === id ? l.b : l.a])
    .filter(Boolean);
}

// Words for how `otherId` is linked to `id` as a spouse: "Wife", "Former husband".
export function spouseWord(id, otherId) {
  const link = tree.spouses.find((l) => (l.a === id && l.b === otherId) || (l.b === id && l.a === otherId));
  const other = tree.people[otherId];
  const word = other?.gender === "m" ? "husband" : other?.gender === "f" ? "wife" : "spouse";
  return link?.former ? "Former " + word : word.charAt(0).toUpperCase() + word.slice(1);
}

// People whose name matches what is being typed, so a copy is not added by mistake.
export function findMatches({ first, father, family }) {
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
  if (!clean(first) || !clean(family)) return [];
  return allPeople().filter((p) =>
    same(p.first, first) && same(p.family, family) && (!clean(father) || same(p.father, father)));
}

export function fullName(p) {
  return [p.first, p.father, p.family].filter(Boolean).join(" ");
}

// "Son of X and Y", used wherever names could repeat.
export function parentsLabel(p, { full = false } = {}) {
  const names = parentsOf(p.id).map((x) => (full ? fullName(x) : x.first));
  if (!names.length) return "";
  const word = p.gender === "m" ? "Son" : p.gender === "f" ? "Daughter" : "Child";
  return word + " of " + names.join(full ? " and " : " & ");
}

// ---- Rules for links ----

// True if `ancestorId` is `id` or appears above `id` in the tree.
function isAncestorOrSelf(ancestorId, id, seen = new Set()) {
  if (ancestorId === id) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  return parentsOf(id).some((p) => isAncestorOrSelf(ancestorId, p.id, seen));
}

// Returns a short reason why the link is not allowed, or null if it is fine.
export function checkParentLink(parentId, childId) {
  if (parentId === childId) return "A person cannot be their own parent.";
  if (tree.parents.some((l) => l.parent === parentId && l.child === childId))
    return "They are already linked as parent and child.";
  if (parentsOf(childId).length >= 2) return "This person already has two parents.";
  if (isAncestorOrSelf(childId, parentId))
    return "That would make someone their own ancestor.";
  if (spousesOf(childId).some((s) => s.id === parentId))
    return "They are already linked as spouses.";
  return null;
}

export function checkSpouseLink(aId, bId) {
  if (aId === bId) return "A person cannot be their own spouse.";
  if (spousesOf(aId).some((s) => s.id === bId)) return "They are already linked as spouses.";
  if (isAncestorOrSelf(aId, bId) || isAncestorOrSelf(bId, aId))
    return "A parent and child cannot be linked as spouses.";
  return null;
}

// ---- Changing ----

export function addPerson({ first, father, family, gender }) {
  const person = {
    id: newId(),
    first: clean(first),
    father: clean(father),
    family: clean(family),
    gender: gender === "m" || gender === "f" ? gender : null,
  };
  if (!person.first) throw new Error("First name is needed.");
  tree.people[person.id] = person;
  return person;
}

// Use inside change(), which saves.
export function setMe(id) {
  tree.meId = id;
}

export function linkParent(parentId, childId) {
  const problem = checkParentLink(parentId, childId);
  if (problem) throw new Error(problem);
  tree.parents.push({ parent: parentId, child: childId });
}

export function linkSpouse(aId, bId, former = false) {
  const problem = checkSpouseLink(aId, bId);
  if (problem) throw new Error(problem);
  tree.spouses.push({ a: aId, b: bId, former: !!former });
}

// Runs several changes as one step: either all of them are saved, or none.
export function change(fn) {
  const before = JSON.stringify(tree);
  try {
    const result = fn();
    save();
    return result;
  } catch (err) {
    tree = JSON.parse(before);
    throw err;
  }
}

// Ask the browser to keep our data even when space is low.
export function askToKeepData() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

// ---- Backups: export, import and the reminder ----
//
// A backup is a ".family" file. Inside it is plain text (JSON) holding the whole tree,
// so it can be opened on any device with this app.
// How many changes were made since the last backup is kept separately, under BACKUP_KEY:
//   lastBackup:   when the tree was last exported or imported (a time in ms), or null
//   changes:      how many changes were saved since then
//   firstChange:  when the first of those changes was made
//   snoozeUntil:  "Not now" was pressed, so stay quiet until this time

const BACKUP_KEY = "familyTree.backup.v1";
const FILE_KIND = "family-tree";

function readBackupInfo() {
  try {
    return { lastBackup: null, changes: 0, firstChange: null, snoozeUntil: 0,
      ...JSON.parse(localStorage.getItem(BACKUP_KEY) || "{}") };
  } catch {
    return { lastBackup: null, changes: 0, firstChange: null, snoozeUntil: 0 };
  }
}

function writeBackupInfo(info) {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(info)); } catch { /* not important enough to stop the app */ }
}

function countChange() {
  const info = readBackupInfo();
  info.changes += 1;
  if (!info.firstChange) info.firstChange = Date.now();
  writeBackupInfo(info);
}

export function backupInfo() {
  return readBackupInfo();
}

// Call this once the file has been saved, so the counting starts again.
export function markBackedUp() {
  writeBackupInfo({ lastBackup: Date.now(), changes: 0, firstChange: null, snoozeUntil: 0 });
}

// "Not now": ask again tomorrow.
export function snoozeReminder() {
  const info = readBackupInfo();
  info.snoozeUntil = Date.now() + 24 * 60 * 60 * 1000;
  writeBackupInfo(info);
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
export const CHANGES_BEFORE_REMINDER = 10;

// True when it is time to remind: 10 changes since the last backup,
// or a week has passed and something changed in that time. Whichever comes first.
export function reminderDue(now = Date.now()) {
  const info = readBackupInfo();
  if (!tree.meId || info.changes === 0 || now < info.snoozeUntil) return false;
  if (info.changes >= CHANGES_BEFORE_REMINDER) return true;
  const since = info.lastBackup || info.firstChange || now;
  return now - since >= WEEK;
}

// The whole tree as the text that goes inside a ".family" file.
export function exportText(device) {
  return JSON.stringify({
    kind: FILE_KIND,
    format: 1,
    exportedAt: new Date().toISOString(),
    device: device || null,
    tree,
  }, null, 2);
}

// Reads the text of a file and checks it is a family tree from this app.
// Returns { tree, exportedAt, device, count } or throws an error that says what is wrong.
export function readFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not a family tree backup. Choose a .family file exported from this app.");
  }
  if (!data || data.kind !== FILE_KIND || !data.tree || typeof data.tree !== "object")
    throw new Error("This file is not a family tree backup. Choose a .family file exported from this app.");
  if (data.format > 1)
    throw new Error("This backup was made by a newer version of the app. Reload the app and try again.");

  const src = data.tree;
  const people = {};
  for (const [id, p] of Object.entries(src.people || {})) {
    if (!p || typeof p !== "object" || typeof p.first !== "string" || !p.first.trim()) continue;
    people[id] = {
      id,
      first: clean(p.first),
      father: clean(typeof p.father === "string" ? p.father : ""),
      family: clean(typeof p.family === "string" ? p.family : ""),
      gender: p.gender === "m" || p.gender === "f" ? p.gender : null,
    };
  }
  const known = (id) => typeof id === "string" && !!people[id];
  const parents = (Array.isArray(src.parents) ? src.parents : [])
    .filter((l) => l && known(l.parent) && known(l.child) && l.parent !== l.child)
    .map((l) => ({ parent: l.parent, child: l.child }));
  const spouses = (Array.isArray(src.spouses) ? src.spouses : [])
    .filter((l) => l && known(l.a) && known(l.b) && l.a !== l.b)
    .map((l) => ({ a: l.a, b: l.b, former: !!l.former }));
  const safe = { version: 1, people, parents, spouses, meId: known(src.meId) ? src.meId : null };

  const count = Object.keys(people).length;
  if (!count) throw new Error("This backup has nobody in it, so there is nothing to import.");
  if (!safe.meId) throw new Error("This backup does not say who “you” are, so it cannot be opened.");
  return { tree: safe, exportedAt: data.exportedAt || null, device: data.device || null, count };
}

// Swaps the tree on this device for the one from a file. Everything here before is replaced.
export function replaceTree(newTree) {
  tree = JSON.parse(JSON.stringify(newTree));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  markBackedUp(); // the tree now matches a file, so nothing is at risk
  listeners.forEach((fn) => fn());
}
