// kin.js
// Works out how two people are related, in words: "first cousin once removed",
// "great-uncle's wife's father". Only parent-child and spouse links are stored,
// so everything else is worked out here from those links.
//
// relationship(data, fromId, toId) says what `toId` is to `fromId`:
//   kind:    "self", "blood" (shared ancestor), "marriage" (linked through a spouse) or "none"
//   words:   lower case, without "your", e.g. "first cousin once removed"
//   via:     for blood relatives on one side, the parent of `fromId` that side runs through
//            (an id, or "both" when it runs through both parents); for a relative by
//            marriage that starts with a spouse, that spouse's id, as { spouse: id }
//   path:    the people from `fromId` to `toId`, one link at a time
//   common:  ids on the path who are the shared ancestor of the two ends of a blood stretch
//   also:    other ways they are related too, e.g. when parents are cousins: [{ words, via }]

import { pathBetween } from "./layout.js";

// ---- Reading the links quickly ----

function index(data) {
  const parents = new Map();
  const children = new Map();
  const spouses = new Map();
  const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  for (const l of data.parents) {
    if (!data.people[l.parent] || !data.people[l.child]) continue;
    add(parents, l.child, l.parent);
    add(children, l.parent, l.child);
  }
  for (const l of data.spouses) {
    if (!data.people[l.a] || !data.people[l.b]) continue;
    add(spouses, l.a, { id: l.b, former: !!l.former });
    add(spouses, l.b, { id: l.a, former: !!l.former });
  }
  return {
    data,
    gender: (id) => data.people[id]?.gender || null,
    parents: (id) => parents.get(id) || [],
    children: (id) => children.get(id) || [],
    spouse: (a, b) => (spouses.get(a) || []).find((s) => s.id === b) || null,
  };
}

// Everyone above `id` (and `id` itself at 0), with how many generations up they are.
// next: the person one step back down towards `id`, to rebuild the line.
// via: which of `id`'s own parents the closest route runs through.
function ancestors(ix, id) {
  const depth = new Map([[id, 0]]);
  const next = new Map();
  const via = new Map([[id, new Set()]]);
  let level = [id];
  for (let d = 1; level.length; d++) {
    const up = [];
    for (const child of level) {
      for (const p of ix.parents(child)) {
        const routes = d === 1 ? new Set([p]) : via.get(child);
        if (!depth.has(p)) {
          depth.set(p, d);
          next.set(p, child);
          via.set(p, new Set(routes));
          up.push(p);
        } else if (depth.get(p) === d) {
          routes.forEach((r) => via.get(p).add(r));
        }
      }
    }
    level = up;
  }
  return { depth, next, via };
}

// ---- Words ----

const pick = (g, male, female, either) => (g === "m" ? male : g === "f" ? female : either);
const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const ordinal = (n) => ORDINALS[n] || n + "th";
const TIMES = ["", "once", "twice", "three times", "four times", "five times"];
const removed = (n) => (n ? " " + (TIMES[n] || n + " times") + " removed" : "");

// "great-" a number of times: great-, great-great-, then 3x great-.
function greats(n) {
  if (n <= 0) return "";
  if (n <= 2) return "great-".repeat(n);
  return n + "x great-";
}

// a: generations from the first person up to the shared ancestor.
// b: generations from the second person up to them. g: the second person's gender.
export function bloodWord(a, b, g, half = false) {
  if (a === 0 && b === 0) return "you";
  if (a === 0) {
    const base = pick(g, "son", "daughter", "child");
    return b === 1 ? base : greats(b - 2) + "grand" + base;
  }
  if (b === 0) {
    const base = pick(g, "father", "mother", "parent");
    return a === 1 ? base : greats(a - 2) + "grand" + base;
  }
  const h = half ? "half-" : "";
  if (a === 1 && b === 1) return h + pick(g, "brother", "sister", "sibling");
  if (a === 1) return h + greats(b - 2) + pick(g, "nephew", "niece", "nephew or niece");
  if (b === 1) return h + greats(a - 2) + pick(g, "uncle", "aunt", "uncle or aunt");
  return (half ? "half " : "") + ordinal(Math.min(a, b) - 1) + " cousin" + removed(Math.abs(a - b));
}

// ---- Related by blood ----

// The closest shared ancestor of two people, or null if they have none in the tree.
function blood(ix, fromId, toId, more = true) {
  if (fromId === toId) return { a: 0, b: 0, path: [fromId], common: null, half: false, via: null, words: "you", also: [] };
  const up1 = ancestors(ix, fromId);
  const up2 = ancestors(ix, toId);
  const shared = [...up1.depth.keys()].filter((id) => up2.depth.has(id));
  if (!shared.length) return null;
  const sharedSet = new Set(shared);
  // The lowest shared ancestors: none of their children is also a shared ancestor.
  const lowest = shared.filter((c) => !ix.children(c).some((k) => sharedSet.has(k)));

  const g = ix.gender(toId);
  const options = lowest.map((c) => {
    const a = up1.depth.get(c);
    const b = up2.depth.get(c);
    let half = false;
    if (a > 0 && b > 0) {
      // Half: the two lines start from children of `c` who share only one recorded parent.
      const ca = up1.next.get(c);
      const cb = up2.next.get(c);
      const pa = ix.parents(ca);
      const pb = ix.parents(cb);
      half = pa.length === 2 && pb.length === 2 && pa.filter((p) => pb.includes(p)).length === 1;
    }
    const routes = up1.via.get(c);
    const via = routes.size === 2 ? "both" : routes.size === 1 ? [...routes][0] : null;
    return { c, a, b, half, via, words: bloodWord(a, b, g, half) };
  }).sort((x, y) => (x.a + x.b) - (y.a + y.b) || x.a - y.a);

  const best = options[0];
  // The line: up from the first person to the shared ancestor, then down to the second.
  const upLine = [];
  for (let id = best.c; id !== undefined; id = up1.next.get(id)) upLine.unshift(id);
  const downLine = [];
  for (let id = up2.next.get(best.c); id !== undefined; id = up2.next.get(id)) downLine.push(id);

  // Other ways they are related, e.g. a cousin on both your father's and mother's side.
  // The same words on the same side are one relationship (through a grandfather and grandmother).
  // When parents are related to each other, a person can be related through each parent
  // in a different way, so look up through each parent on their own too.
  const others = options.slice(1);
  if (more) {
    for (const p of ix.parents(fromId)) {
      const r = blood(ix, p, toId, false);
      if (r && r.a >= 1) others.push({ a: r.a + 1, b: r.b, half: r.half, via: p, words: bloodWord(r.a + 1, r.b, g, r.half) });
    }
  }
  const keyOf = (o) => o.words + "|" + (sideMatters(o) ? o.via : "");
  const seen = new Set([keyOf(best)]);
  const also = [];
  for (const o of others) {
    const key = keyOf(o);
    if (seen.has(key) || (best.via === "both" && o.words === best.words)) continue;
    seen.add(key);
    also.push({ words: o.words, via: sideMatters(o) ? o.via : null });
  }
  return {
    a: best.a, b: best.b, half: best.half, words: best.words, via: best.via,
    path: [...upLine, ...downLine],
    common: best.a > 0 && best.b > 0 ? best.c : null,
    also,
  };
}

// Whether the side of the family is worth saying: grandparents, uncles, cousins, half-siblings.
function sideMatters(r) {
  return r.via && (r.a >= 2 || (r.a === 1 && r.b >= 1 && r.half));
}

// ---- Related by marriage ----

// Words for one spouse link: "wife", "former husband".
function spouseWord(ix, fromId, toId) {
  const link = ix.spouse(fromId, toId);
  const word = pick(ix.gender(toId), "husband", "wife", "spouse");
  return link?.former ? "former " + word : word;
}

// Joins two neighbouring steps into one word where English has one:
// wife's father is father-in-law, father's wife is stepmother, and so on.
function merge(ix, x, y) {
  const g = y.gender;
  const is = (s, a, b) => s.type === "blood" && s.a === a && s.b === b && !s.half;
  if (x.type === "spouse") {
    if (is(y, 1, 0)) return { type: "in-law", words: pick(g, "father", "mother", "parent") + "-in-law" };
    if (is(y, 1, 1)) return { type: "in-law", words: pick(g, "brother", "sister", "sibling") + "-in-law" };
    if (is(y, 0, 1)) return { type: "step-child", words: pick(g, "stepson", "stepdaughter", "stepchild") };
  }
  if (y.type === "spouse") {
    if (is(x, 1, 1)) return { type: "in-law", words: pick(g, "brother", "sister", "sibling") + "-in-law" };
    if (is(x, 0, 1)) return { type: "in-law", words: pick(g, "son", "daughter", "child") + "-in-law" };
    if (is(x, 0, 2)) return { type: "in-law", words: pick(g, "grandson", "granddaughter", "grandchild") + "-in-law" };
    if (is(x, 1, 0)) return { type: "step-parent", words: pick(g, "stepfather", "stepmother", "step-parent") };
  }
  if (x.type === "step-parent" && is(y, 0, 1))
    return { type: "step-sibling", words: pick(g, "stepbrother", "stepsister", "stepsibling") };
  return null;
}

// Splits a chain of people into steps that each have a word, then joins them
// with "'s": "great-uncle's wife's father".
function describeChain(ix, path) {
  const steps = [];
  let start = 0;
  let last = null; // the blood link from `start` to the person before this one
  const close = (end) => {
    if (end > start) steps.push({ type: "blood", ...last, from: path[start], to: path[end], gender: ix.gender(path[end]) });
  };
  for (let i = 1; i < path.length; i++) {
    if (ix.spouse(path[i - 1], path[i])) {
      close(i - 1);
      steps.push({ type: "spouse", words: spouseWord(ix, path[i - 1], path[i]), from: path[i - 1], to: path[i], gender: ix.gender(path[i]) });
      start = i;
      last = null;
      continue;
    }
    const r = blood(ix, path[start], path[i]);
    if (r) { last = r; continue; }
    // The blood link breaks here (e.g. your son's mother), so start a new step.
    close(i - 1);
    start = i - 1;
    last = blood(ix, path[start], path[i]);
  }
  close(path.length - 1);

  // Join neighbouring steps where there is one word for both.
  const merged = [];
  for (const s of steps) {
    let cur = s;
    while (merged.length) {
      const m = merge(ix, merged[merged.length - 1], cur);
      if (!m) break;
      cur = { ...m, from: merged.pop().from, to: cur.to, gender: cur.gender };
    }
    merged.push(cur);
  }
  return { steps, merged };
}

// ---- The answer ----

export function relationship(data, fromId, toId, ix = index(data)) {
  if (!data.people[fromId] || !data.people[toId]) return { kind: "none", words: "", path: [], common: [], also: [], via: null };
  if (fromId === toId) return { kind: "self", words: "you", path: [fromId], common: [], also: [], via: null };

  const b = blood(ix, fromId, toId);
  if (b) {
    return {
      kind: "blood",
      words: b.words,
      via: sideMatters(b) ? b.via : null,
      path: b.path,
      common: b.common ? [b.common] : [],
      also: b.also.map((o) => ({ words: o.words, via: o.via })),
    };
  }

  const path = pathBetween(data, fromId, toId);
  if (path.length < 2) return { kind: "none", words: "", path: [], common: [], also: [], via: null };
  const { steps, merged } = describeChain(ix, path);
  const words = merged.map((s) => s.words).join("'s ");

  // Which side it starts on: a blood relative's side, or the spouse it goes through.
  let via = null;
  const first = steps[0];
  if (first.type === "spouse") via = { spouse: first.to };
  else if (first.type === "blood") {
    const r = blood(ix, first.from, first.to);
    if (r && sideMatters(r)) via = r.via;
  }
  // The shared ancestor in each blood stretch, for the "Common ancestor" label.
  const common = steps.filter((s) => s.type === "blood")
    .map((s) => blood(ix, s.from, s.to)?.common).filter(Boolean);
  return { kind: "marriage", words, via, path, common, also: [] };
}

// For each person on the path, what they are to `fromId`: "Father", "Great-uncle".
export function pathWithWords(data, fromId, path) {
  const ix = index(data);
  return path.map((id) => ({ id, words: relationship(data, fromId, id, ix).words }));
}

// The chain of people from one person to another, to draw the gold line on the chart.
export function pathTo(data, fromId, toId) {
  return relationship(data, fromId, toId).path;
}
