// fold.js
// Collapse and expand branches ("folding").
// Folding a person hides everyone below them on the chart: their children,
// grandchildren and so on, plus husbands and wives who married into that branch.
// Nothing is deleted. Which people are folded is remembered on this device only,
// separately from the family data, so it is not part of undo or export.

const STORAGE_KEY = "familyTree.folded.v1";

let folded = load();

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...folded])); } catch { /* not important enough to stop the app */ }
}

export function isFolded(id) {
  return folded.has(id);
}

export function toggle(id) {
  if (folded.has(id)) folded.delete(id);
  else folded.add(id);
  save();
}

export function expandAll() {
  if (!folded.size) return;
  folded.clear();
  save();
}

// Open every folded branch that hides this person. Returns true if anything opened.
export function reveal(data, id) {
  let opened = false;
  for (const root of [...folded]) {
    if (data.people[root] && hiddenBelow(data, [root]).has(id)) {
      folded.delete(root);
      opened = true;
    }
  }
  if (opened) save();
  return opened;
}

// Who is linked to whom, in a form that is quick to look up.
function links(data) {
  const parentsOf = new Map();
  const childrenOf = new Map();
  const spousesOf = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  for (const l of data.parents) {
    if (!data.people[l.parent] || !data.people[l.child]) continue;
    add(parentsOf, l.child, l.parent);
    add(childrenOf, l.parent, l.child);
  }
  for (const l of data.spouses) {
    if (!data.people[l.a] || !data.people[l.b]) continue;
    add(spousesOf, l.a, l.b);
    add(spousesOf, l.b, l.a);
  }
  return { parentsOf, childrenOf, spousesOf };
}

// Everyone hidden when the people in `roots` are folded.
// 1. Everyone descended from a folded person is hidden.
//    A folded person inside another folded branch is hidden too.
// 2. A husband or wife is hidden too when all their marriages are to hidden people
//    and they have no parents of their own still showing (so they only belong to
//    the folded branch). Their own children are then hidden as well.
function hiddenBelow(data, roots, cached) {
  const { parentsOf, childrenOf, spousesOf } = cached || links(data);
  const hidden = new Set();
  const queue = [];
  const hide = (id) => {
    if (hidden.has(id)) return;
    hidden.add(id);
    queue.push(id);
  };
  const spread = () => {
    while (queue.length) {
      const id = queue.shift();
      (childrenOf.get(id) || []).forEach(hide);
    }
  };
  roots.forEach((r) => (childrenOf.get(r) || []).forEach(hide));
  spread();
  for (let round = 0; round < 50; round++) {
    let changed = false;
    for (const id of Object.keys(data.people)) {
      if (hidden.has(id)) continue;
      const spouses = spousesOf.get(id) || [];
      if (!spouses.length || !spouses.every((s) => hidden.has(s))) continue;
      if (!(parentsOf.get(id) || []).every((p) => hidden.has(p))) continue;
      hide(id);
      changed = true;
    }
    spread();
    if (!changed) break;
  }
  return hidden;
}

// What the chart should show right now.
// Returns:
//   data:     the family with the hidden people left out (for drawing)
//   hidden:   Set of hidden ids
//   branches: Map of folded person id -> { count, hasMe } for each fold that is showing
//   canFold:  Set of shown people who have shown children (they get a − button)
export function view(data) {
  const cached = links(data);
  const roots = [...folded].filter((id) => data.people[id]);
  const hidden = hiddenBelow(data, roots, cached);

  const branches = new Map();
  for (const root of roots) {
    if (hidden.has(root)) continue; // inside another folded branch
    const below = hiddenBelow(data, [root], cached);
    if (!below.size) continue; // nobody below them any more
    branches.set(root, { count: below.size, hasMe: below.has(data.meId) });
  }

  const people = {};
  for (const [id, p] of Object.entries(data.people)) if (!hidden.has(id)) people[id] = p;
  const shown = {
    ...data,
    people,
    parents: data.parents.filter((l) => people[l.parent] && people[l.child]),
    spouses: data.spouses.filter((l) => people[l.a] && people[l.b]),
  };

  const canFold = new Set();
  for (const l of shown.parents) if (!branches.has(l.parent)) canFold.add(l.parent);

  return { data: shown, hidden, branches, canFold };
}

// The folded person whose branch holds this hidden person (to centre on instead).
export function shownFoldFor(data, id) {
  const v = view(data);
  if (!v.hidden.has(id)) return id;
  for (const root of v.branches.keys()) {
    if (hiddenBelow(data, [root]).has(id)) return root;
  }
  return null;
}
