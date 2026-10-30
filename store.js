// store.js
// Holds the family tree data and saves it on this device (in the browser).
//
// The tree is stored as:
//   people:  { id: { id, first, father, family } }
//   parents: [ { parent, child } ]   one entry per parent-child link
//   spouses: [ { a, b } ]            one entry per marriage
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

export function fullName(p) {
  return [p.first, p.father, p.family].filter(Boolean).join(" ");
}

// "son/daughter of X and Y", used wherever names could repeat.
export function parentsLabel(p) {
  const names = parentsOf(p.id).map((x) => x.first);
  return names.length ? "Child of " + names.join(" and ") : "";
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

export function addPerson({ first, father, family }) {
  const person = { id: newId(), first: clean(first), father: clean(father), family: clean(family) };
  if (!person.first) throw new Error("First name is needed.");
  tree.people[person.id] = person;
  return person;
}

export function setMe(id) {
  tree.meId = id;
  save();
}

export function linkParent(parentId, childId) {
  const problem = checkParentLink(parentId, childId);
  if (problem) throw new Error(problem);
  tree.parents.push({ parent: parentId, child: childId });
}

export function linkSpouse(aId, bId) {
  const problem = checkSpouseLink(aId, bId);
  if (problem) throw new Error(problem);
  tree.spouses.push({ a: aId, b: bId });
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
