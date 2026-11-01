// find.js
// Search by name: which people match what is typed, and how to tell apart people with the same name.
// No screens here, so it can be checked on its own. The search screen is in search.js.

import { relationship } from "./kin.js";

export const fullName = (p) => [p.first, p.father, p.family].filter(Boolean).join(" ");

// "Al-Hasan’s" becomes "al hasans": small letters, no accents, no apostrophes, dashes become spaces.
export function norm(text = "") {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'`ʼ]/g, "")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();
}

// The shape of a name with each run of vowels made the same, so different English spellings
// of the same Arabic name look alike: Yousef, Yusuf, Youssef and Yousif all become "y*s*f",
// Mohammed and Muhammad become "m*h*m*d" (but Mahmoud stays "m*hm*d"),
// Abdulla and Abdullah become "abd*l*".
export function skeleton(word) {
  if (!word) return "";
  let s = word[0] + word.slice(1).replace(/[aeiouy]+/g, "*");
  s = s.replace(/(.)\1+/g, "$1");
  return s.replace(/\*h$/, "*");
}

// Does one typed word match one word of a name? "exact" when the name word starts with it,
// "spelled" when it is another spelling of it, otherwise null.
function wordMatch(typed, word) {
  if (word.startsWith(typed)) return "exact";
  if (typed.length < 3) return null;
  const a = skeleton(typed);
  const b = skeleton(word);
  if (a === b) return "spelled";
  if (typed.length >= 4 && a.length >= 3 && b.startsWith(a)) return "spelled";
  return null;
}

// The words of a person's name, each with which part it is in: 0 first, 1 father's, 2 family.
function nameWords(p) {
  const out = [];
  [p.first, p.father, p.family].forEach((part, i) => {
    for (const raw of (part || "").split(/[\s\-–]+/)) {
      const w = norm(raw).replace(/ /g, "");
      if (w) out.push({ w, raw, part: i });
    }
  });
  return out;
}

// How a person matches what is typed: { part, spelled } or null.
// part is where the match starts (0 means their own first name). spelled lists the words
// in their name that matched only as another spelling, for the "Spelled Yusuf" tag.
export function matchPerson(p, query) {
  const typed = norm(query).split(" ").filter(Boolean);
  if (!typed.length) return null;
  const words = nameWords(p);
  let best = null;
  for (let start = 0; start + typed.length <= words.length; start++) {
    const spelled = [];
    let ok = true;
    for (let k = 0; k < typed.length && ok; k++) {
      const m = wordMatch(typed[k], words[start + k].w);
      if (!m) ok = false;
      else if (m === "spelled") spelled.push(words[start + k].raw);
    }
    if (!ok) continue;
    const found = { part: words[start].part, spelled };
    if (!best || spelled.length < best.spelled.length
      || (spelled.length === best.spelled.length && found.part < best.part)) best = found;
  }
  if (best) return best;

  // Spaces typed differently: "Algosaibi" finds "Al Gosaibi" and the other way round.
  const compact = typed.join("");
  if (compact.length >= 3) {
    for (let part = 0; part < 3; part++) {
      if (!words.some((x) => x.part === part)) continue;
      if (words.filter((x) => x.part >= part).map((x) => x.w).join("").startsWith(compact)) return { part, spelled: [] };
    }
  }
  return null;
}

// Everyone who matches, in two groups like the design:
//   named: their own first name matches ("Named Yousef")
//   other: their father's or family name matches ("Father or family named Yousef")
// Closest relatives come first. People with exactly the same full name are put together
// as one entry { same: true, name, items } so they can be told apart side by side.
export function search(data, query) {
  const named = [];
  const other = [];
  for (const p of Object.values(data.people)) {
    const m = matchPerson(p, query);
    if (!m) continue;
    const rel = relationship(data, data.meId, p.id);
    (m.part === 0 ? named : other).push({ id: p.id, person: p, spelled: m.spelled, rel });
  }
  const distance = (x) => (x.rel.kind === "none" ? 1e6 : x.rel.path.length);
  const order = (a, b) => distance(a) - distance(b) || fullName(a.person).localeCompare(fullName(b.person));
  return { named: cluster(named.sort(order)), other: cluster(other.sort(order)), count: named.length + other.length };
}

// Puts people with the same full name together, where the first of them would be.
function cluster(items) {
  const byName = new Map();
  for (const it of items) {
    const key = norm(fullName(it.person));
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(it);
  }
  const out = [];
  const done = new Set();
  for (const it of items) {
    const key = norm(fullName(it.person));
    if (done.has(key)) continue;
    done.add(key);
    const all = byName.get(key);
    out.push(all.length > 1 ? { same: true, name: fullName(it.person), items: all } : it);
  }
  return out;
}

// For names that should be compared, marks the words that are not the same in all of them.
// diffWords(["Mahmoud Saleh Haddad", "Mahmoud Yousef Haddad"]) marks Saleh and Yousef.
// A missing name (null) stays null.
export function diffWords(names) {
  const split = names.map((n) => (n ? n.split(/\s+/).filter(Boolean) : null));
  const present = split.filter(Boolean);
  return split.map((words) => words && words.map((word, i) => ({
    word,
    differs: present.length < split.length || present.some((o) => norm(o[i] || "") !== norm(word)),
  })));
}
