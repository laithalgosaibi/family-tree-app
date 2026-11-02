// branch.js
// Separate branches: a family you know but cannot place in your tree yet.
// A branch is not saved as anything special. It is simply a group of people who are
// linked to each other but have no line to you. Once one of them is linked to someone
// in your tree, the whole group joins and the branch is gone.
// This file also suggests likely links from the names, using the Arab naming pattern:
// Salma Hasan Azar's father is probably called Hasan, with the family name Azar.
// No screens here, so it can be checked on its own. The linking screen is in link.js.

import { norm, skeleton } from "./find.js";

// Everyone joined to each other by any chain of links, as groups.
// Returns { groupOf: Map(id -> group), groups: [{ ids, hasMe }] }.
export function groups(data) {
  const near = new Map(Object.keys(data.people).map((id) => [id, []]));
  const join = (a, b) => { if (near.has(a) && near.has(b)) { near.get(a).push(b); near.get(b).push(a); } };
  for (const l of data.parents) join(l.parent, l.child);
  for (const l of data.spouses) join(l.a, l.b);

  const groupOf = new Map();
  const list = [];
  const starts = data.meId && near.has(data.meId) ? [data.meId, ...near.keys()] : [...near.keys()];
  for (const start of starts) {
    if (groupOf.has(start)) continue;
    const group = { ids: [], hasMe: false };
    groupOf.set(start, group);
    const queue = [start];
    while (queue.length) {
      const id = queue.shift();
      group.ids.push(id);
      if (id === data.meId) group.hasMe = true;
      for (const n of near.get(id)) if (!groupOf.has(n)) { groupOf.set(n, group); queue.push(n); }
    }
    list.push(group);
  }
  return { groupOf, groups: list };
}

// The separate branch a person is in, or null when they are joined to you.
// { ids, count }
export function branchOf(data, id, g = groups(data)) {
  const group = g.groupOf.get(id);
  if (!group || group.hasMe) return null;
  return { ids: group.ids, count: group.ids.length };
}

// Every separate branch, biggest first.
export function allBranches(data) {
  return groups(data).groups.filter((x) => !x.hasMe)
    .map((x) => ({ ids: x.ids, count: x.ids.length }))
    .sort((a, b) => b.count - a.count);
}

// ---- Suggested links, from the names ----

// Two names are the same when they match, or are another English spelling (Hasan, Hassan).
function sameName(a, b) {
  const x = norm(a).replace(/ /g, "");
  const y = norm(b).replace(/ /g, "");
  if (!x || !y) return false;
  return x === y || skeleton(x) === skeleton(y);
}
function exactName(a, b) {
  return norm(a) === norm(b);
}

const possessive = (p) => p.first + "’s";
const his = (p) => (p.gender === "m" ? "his" : p.gender === "f" ? "her" : "their");

// Could `dad` be `child`'s father? Only when the child has no father yet,
// and has room for another parent.
function couldBeFather(data, dad, child) {
  if (dad.gender === "f" || !child.father || !child.family || !dad.family) return null;
  if (!sameName(dad.first, child.father) || !sameName(dad.family, child.family)) return null;
  const ps = data.parents.filter((l) => l.child === child.id).map((l) => data.people[l.parent]).filter(Boolean);
  if (ps.length >= 2 || ps.some((p) => p.gender === "m" || p.gender == null)) return null;
  const exact = exactName(dad.first, child.father) && exactName(dad.family, child.family);
  return {
    exact,
    reason: `${possessive(child)} father’s name is ${child.father}, and ${his(child)} family name is ${child.family}.`,
  };
}

// Likely links between the people in `fromIds` (a separate branch) and the people in `toIds`.
// Each one: { id, otherId, role, reason } where role says what `id` would be to `otherId`:
// "parent" (id is otherId's father) or "child" (otherId is id's father).
// People in your tree come first, then exact spellings before other spellings.
export function suggestLinks(data, fromIds, toIds) {
  const g = groups(data);
  const out = [];
  for (const a of fromIds) {
    const pa = data.people[a];
    if (!pa) continue;
    for (const b of toIds) {
      const pb = data.people[b];
      if (!pb || g.groupOf.get(a) === g.groupOf.get(b)) continue;
      const down = couldBeFather(data, pa, pb);
      if (down) out.push({ id: a, otherId: b, role: "parent", reason: down.reason, exact: down.exact, mine: !!g.groupOf.get(b)?.hasMe });
      const up = couldBeFather(data, pb, pa);
      if (up) out.push({ id: a, otherId: b, role: "child", reason: up.reason, exact: up.exact, mine: !!g.groupOf.get(b)?.hasMe });
    }
  }
  return out.sort((x, y) => (y.mine - x.mine) || (y.exact - x.exact));
}

// Suggestions for one person in a branch, linking them to anyone outside it.
export function suggestFor(data, id) {
  const branch = branchOf(data, id);
  if (!branch) return [];
  const inside = new Set(branch.ids);
  const outside = Object.keys(data.people).filter((x) => !inside.has(x));
  return suggestLinks(data, [id], outside);
}

// The best suggestion for a whole branch, trying `firstId` before everyone else in it.
export function suggestForBranch(data, firstId) {
  const own = suggestFor(data, firstId);
  if (own.length) return own[0];
  const branch = branchOf(data, firstId);
  if (!branch) return null;
  const inside = new Set(branch.ids);
  const outside = Object.keys(data.people).filter((x) => !inside.has(x));
  return suggestLinks(data, branch.ids.filter((x) => x !== firstId), outside)[0] || null;
}

// "father", "mother", "son", "wife": what `p` would be, said for the link `role`.
export function roleWord(p, role) {
  const m = p.gender === "m";
  const f = p.gender === "f";
  if (role === "parent") return m ? "father" : f ? "mother" : "parent";
  if (role === "child") return m ? "son" : f ? "daughter" : "child";
  return m ? "husband" : f ? "wife" : "spouse";
}

// "Could Hasan be Salma’s father?" for a suggestion.
export function question(data, s) {
  const p = data.people[s.id];
  const o = data.people[s.otherId];
  if (s.role === "parent") return `Could ${p.first} be ${possessive(o)} ${roleWord(p, "parent")}?`;
  return `Could ${o.first} be ${possessive(p)} ${roleWord(o, "parent")}?`;
}
