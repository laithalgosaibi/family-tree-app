// layout.js
// Works out where every box and line goes on the family chart.
// It only does arithmetic: family data in, positions out. Nothing is drawn here.
//
// The idea, in plain words:
// 1. Everyone gets a row (a generation). Parents sit one row above their children,
//    husbands and wives sit in the same row.
// 2. Husbands and wives are kept side by side as one "block".
// 3. The blocks in each row are put in an order that keeps lines from crossing.
// 4. Each block is slid left or right so that children sit under their parents,
//    without any boxes overlapping.

export const BOX_W = 150;
export const BOX_H = 56;
const SPOUSE_GAP = 30; // between husband and wife
const BLOCK_GAP = 40; // between families in the same row
const ROW_GAP = 80; // between rows, where the lines run
const ROW_H = BOX_H + ROW_GAP;
const PART_GAP = 160; // between parts of the tree that are not connected yet

export function layoutTree(data) {
  const { people, meId } = data;
  const ids = Object.keys(people);
  const exists = (id) => !!people[id];

  // ---- Who is linked to whom ----
  const parentsOf = new Map(ids.map((id) => [id, []]));
  const childrenOf = new Map(ids.map((id) => [id, []]));
  const spousesOf = new Map(ids.map((id) => [id, []])); // [{ id, former }] in the order married
  for (const l of data.parents) {
    if (!exists(l.parent) || !exists(l.child)) continue;
    parentsOf.get(l.child).push(l.parent);
    childrenOf.get(l.parent).push(l.child);
  }
  const marriages = [];
  for (const l of data.spouses) {
    if (!exists(l.a) || !exists(l.b)) continue;
    spousesOf.get(l.a).push({ id: l.b, former: !!l.former });
    spousesOf.get(l.b).push({ id: l.a, former: !!l.former });
    marriages.push(l);
  }
  const neighbours = (id) => [...parentsOf.get(id), ...childrenOf.get(id), ...spousesOf.get(id).map((s) => s.id)];

  // ---- Split into parts that are connected (normally just one) ----
  const partOf = new Map();
  const parts = [];
  const starts = meId && exists(meId) ? [meId, ...ids] : ids;
  for (const start of starts) {
    if (partOf.has(start)) continue;
    const part = [];
    const queue = [start];
    partOf.set(start, parts.length);
    while (queue.length) {
      const id = queue.shift();
      part.push(id);
      for (const n of neighbours(id)) if (!partOf.has(n)) { partOf.set(n, parts.length); queue.push(n); }
    }
    parts.push(part);
  }

  const nodes = new Map(); // id -> { id, x, y }
  let offsetX = 0;
  let height = 0;
  for (const part of parts) {
    const placed = layoutPart(part, { parentsOf, childrenOf, spousesOf, people });
    for (const n of placed.nodes) {
      nodes.set(n.id, { id: n.id, x: n.x + offsetX, y: n.y, gen: n.gen, block: n.block, index: n.index });
    }
    offsetX += placed.width + PART_GAP;
    height = Math.max(height, placed.height);
  }

  const lines = drawLines(nodes, { parentsOf, childrenOf, spousesOf, marriages, data });
  return { nodes, lines, width: Math.max(0, offsetX - PART_GAP), height };
}

// ---- One connected part of the tree ----

function layoutPart(part, { parentsOf, childrenOf, spousesOf, people }) {
  const inPart = new Set(part);

  // 1. Rows. Start from the first person and walk outwards.
  const gen = new Map([[part[0], 0]]);
  const queue = [part[0]];
  while (queue.length) {
    const id = queue.shift();
    const g = gen.get(id);
    const visit = (n, ng) => { if (!gen.has(n)) { gen.set(n, ng); queue.push(n); } };
    parentsOf.get(id).forEach((p) => visit(p, g - 1));
    spousesOf.get(id).forEach((s) => visit(s.id, g));
    childrenOf.get(id).forEach((c) => visit(c, g + 1));
  }
  // Make sure every child is below all of its parents, and spouses share a row.
  for (let round = 0; round < 60; round++) {
    let changed = false;
    for (const id of part) {
      for (const c of childrenOf.get(id)) {
        if (gen.get(c) <= gen.get(id)) { gen.set(c, gen.get(id) + 1); changed = true; }
      }
      for (const s of spousesOf.get(id)) {
        const top = Math.max(gen.get(id), gen.get(s.id));
        if (gen.get(id) !== top) { gen.set(id, top); changed = true; }
      }
    }
    if (!changed) break;
  }
  const minGen = Math.min(...part.map((id) => gen.get(id)));
  for (const id of part) gen.set(id, gen.get(id) - minGen);

  // 2. Blocks: a person with their husbands or wives, side by side.
  const blockOf = new Map();
  const blocks = [];
  for (const id of part) {
    if (blockOf.has(id)) continue;
    // Everyone joined to this person by marriage, in the same row.
    const group = [];
    const stack = [id];
    const seen = new Set([id]);
    while (stack.length) {
      const x = stack.pop();
      group.push(x);
      for (const s of spousesOf.get(x)) {
        if (!seen.has(s.id) && inPart.has(s.id) && gen.get(s.id) === gen.get(x)) { seen.add(s.id); stack.push(s.id); }
      }
    }
    const block = { members: orderBlock(group, spousesOf, people, part), gen: gen.get(id), x: 0 };
    block.members.forEach((m, i) => blockOf.set(m, { block, index: i }));
    block.w = block.members.length * BOX_W + (block.members.length - 1) * SPOUSE_GAP;
    blocks.push(block);
  }
  const blockFor = (id) => blockOf.get(id).block;
  const centreOf = (id) => {
    const { block, index } = blockOf.get(id);
    return block.x + index * (BOX_W + SPOUSE_GAP) + BOX_W / 2;
  };

  // Children grouped by their pair of parents.
  const families = new Map();
  for (const id of part) {
    const ps = parentsOf.get(id);
    if (!ps.length) continue;
    const key = [...ps].sort().join("|");
    if (!families.has(key)) families.set(key, { parents: ps, children: [] });
    families.get(key).children.push(id);
  }
  const familyList = [...families.values()];
  // Where the line to the children starts, left to right.
  const dropX = (fam) => {
    const [a, b] = fam.parents;
    if (!b) return centreOf(a);
    if (blockFor(a) === blockFor(b)) {
      let ia = blockOf.get(a).index;
      let ib = blockOf.get(b).index;
      if (ia > ib) [ia, ib] = [ib, ia];
      const block = blockFor(a);
      if (ib === ia + 1) return block.x + ib * (BOX_W + SPOUSE_GAP) - SPOUSE_GAP / 2;
      const hubIsLeft = spousesOf.get(block.members[ia]).length >= spousesOf.get(block.members[ib]).length;
      return hubIsLeft
        ? block.x + ib * (BOX_W + SPOUSE_GAP) - SPOUSE_GAP / 2
        : block.x + (ia + 1) * (BOX_W + SPOUSE_GAP) - SPOUSE_GAP / 2;
    }
    return (centreOf(a) + centreOf(b)) / 2;
  };

  // 3. Order the blocks in each row.
  const rowCount = Math.max(...blocks.map((b) => b.gen)) + 1;
  let rows = Array.from({ length: rowCount }, () => []);
  // First guess: walk the family from the top of the first person's father's line,
  // going down to children before going up to in-laws. This puts the father's side
  // on the left and the mother's side on the right.
  let top = part[0];
  for (let guard = 0; guard < 200; guard++) {
    const ps = parentsOf.get(top);
    if (!ps.length) break;
    top = ps.find((p) => people[p]?.gender === "m") || ps[0];
  }
  const visited = new Set();
  const visit = (block) => {
    if (visited.has(block)) return;
    visited.add(block);
    rows[block.gen].push(block);
    for (const m of block.members) for (const c of childrenOf.get(m)) visit(blockFor(c));
    for (const m of block.members) for (const p of parentsOf.get(m)) visit(blockFor(p));
  };
  visit(blockFor(top));
  for (const b of blocks) visit(b);

  const pack = () => {
    for (const row of rows) {
      let x = 0;
      for (const b of row) { b.x = x; x += b.w + BLOCK_GAP; }
    }
  };
  const crossings = () => {
    let count = 0;
    for (const row of rows) {
      const edges = [];
      for (const b of row) for (const m of b.members) for (const c of childrenOf.get(m)) {
        if (gen.get(c) === b.gen + 1) edges.push([centreOf(m), centreOf(c)]);
      }
      for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
        const [a1, a2] = edges[i];
        const [b1, b2] = edges[j];
        if ((a1 - b1) * (a2 - b2) < 0) count++;
      }
    }
    return count;
  };
  const sortRow = (row, keyOf) => {
    const keyed = row.map((b, i) => ({ b, i, k: keyOf(b) }));
    keyed.sort((p, q) => p.k - q.k || p.i - q.i);
    return keyed.map((e) => e.b);
  };
  const average = (list, fallback) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : fallback);

  pack();
  let best = rows.map((r) => [...r]);
  let bestCount = crossings();
  for (let round = 0; round < 6 && bestCount > 0; round++) {
    for (let r = 1; r < rowCount; r++) {
      rows[r] = sortRow(rows[r], (b) => average(
        b.members.flatMap((m) => parentsOf.get(m).filter((p) => gen.get(p) === b.gen - 1).map(centreOf)),
        b.x + b.w / 2));
      pack();
    }
    for (let r = rowCount - 2; r >= 0; r--) {
      rows[r] = sortRow(rows[r], (b) => average(
        b.members.flatMap((m) => childrenOf.get(m).filter((c) => gen.get(c) === b.gen + 1).map(centreOf)),
        b.x + b.w / 2));
      pack();
    }
    const count = crossings();
    if (count < bestCount) { bestCount = count; best = rows.map((r) => [...r]); }
  }
  rows = best;
  pack();

  // 4. Slide blocks so children sit under parents and parents over children.
  const offsetIn = (id) => blockOf.get(id).index * (BOX_W + SPOUSE_GAP) + BOX_W / 2;
  for (let round = 0; round < 40; round++) {
    const order = round % 2 === 0 ? rows : [...rows].reverse();
    for (const row of order) {
      const wants = row.map((b) => {
        const asks = [];
        // From its parents: each member wants to be under the line from their parents.
        for (const m of b.members) {
          const ps = parentsOf.get(m);
          if (!ps.length || ps.some((p) => gen.get(p) >= b.gen)) continue;
          const fam = families.get([...ps].sort().join("|"));
          asks.push(dropX(fam) - offsetIn(m));
        }
        // From its children: the line down should sit over the middle of the children.
        for (const fam of familyList) {
          if (!fam.parents.every((p) => blockFor(p) === b)) continue;
          const kids = fam.children.filter((c) => gen.get(c) > b.gen);
          if (!kids.length) continue;
          const mid = (Math.min(...kids.map(centreOf)) + Math.max(...kids.map(centreOf))) / 2;
          asks.push(b.x + (mid - dropX(fam)));
        }
        return asks.length ? { x: average(asks), weight: asks.length } : { x: b.x, weight: 0.05 };
      });
      placeRow(row, wants);
    }
  }

  // Line up the left edge at 0.
  const minX = Math.min(...blocks.map((b) => b.x));
  for (const b of blocks) b.x -= minX;
  const width = Math.max(...blocks.map((b) => b.x + b.w));

  const nodes = [];
  for (const b of blocks) {
    b.members.forEach((id, i) => nodes.push({
      id, x: b.x + i * (BOX_W + SPOUSE_GAP), y: b.gen * ROW_H, gen: b.gen, block: b, index: i,
    }));
  }
  return { nodes, width, height: rowCount * ROW_H - ROW_GAP };
}

// Order husbands and wives in a block. A man with one wife sits on the left.
// Someone with several spouses sits in the middle: the first spouse on the left,
// the others to the right in the order they married.
function orderBlock(group, spousesOf, people, part) {
  if (group.length === 1) return group;
  const rank = (id) => part.indexOf(id);
  const hub = [...group].sort((a, b) =>
    spousesOf.get(b).length - spousesOf.get(a).length
    || (people[b]?.gender === "m") - (people[a]?.gender === "m")
    || rank(a) - rank(b))[0];
  const inGroup = new Set(group);
  const list = spousesOf.get(hub).map((s) => s.id).filter((id) => inGroup.has(id));
  let left = [];
  let right = [];
  if (list.length === 1) {
    (people[hub]?.gender === "f" ? left : right).push(list[0]);
  } else {
    left = list.slice(0, 1);
    right = list.slice(1);
  }
  const placed = new Set([hub, ...list]);
  // Spouses of spouses (for example a wife who remarried) go further out.
  const extend = (side, outward) => {
    for (let i = 0; i < side.length; i++) {
      for (const s of spousesOf.get(side[i])) {
        if (inGroup.has(s.id) && !placed.has(s.id)) { placed.add(s.id); outward(s.id); }
      }
    }
  };
  extend(left, (id) => left.push(id));
  extend(right, (id) => right.push(id));
  const rest = group.filter((id) => !placed.has(id));
  return [...left.reverse(), hub, ...right, ...rest];
}

// Slide the blocks of one row as close as possible to where they want to be,
// keeping their order and never letting them overlap. (This is a standard method
// called "pool adjacent violators".)
function placeRow(row, wants) {
  const shift = [];
  let s = 0;
  row.forEach((b, i) => { shift.push(s); s += b.w + BLOCK_GAP; });
  const pools = [];
  row.forEach((b, i) => {
    let pool = { sum: (wants[i].x - shift[i]) * wants[i].weight, weight: wants[i].weight, count: 1 };
    pool.value = pool.sum / pool.weight;
    while (pools.length && pools[pools.length - 1].value > pool.value) {
      const prev = pools.pop();
      pool = { sum: prev.sum + pool.sum, weight: prev.weight + pool.weight, count: prev.count + pool.count };
      pool.value = pool.sum / pool.weight;
    }
    pools.push(pool);
  });
  let i = 0;
  for (const pool of pools) {
    for (let k = 0; k < pool.count; k++, i++) row[i].x = pool.value + shift[i];
  }
}

// ---- Lines ----

function drawLines(nodes, { parentsOf, spousesOf, marriages }) {
  const spouseLines = [];
  const childLines = [];
  const pairDrop = new Map(); // "a|b" -> { x, y }
  const levels = new Map(); // how many lines already run over the top of a person

  const centreX = (n) => n.x + BOX_W / 2;

  for (const m of marriages) {
    const a = nodes.get(m.a);
    const b = nodes.get(m.b);
    if (!a || !b) continue;
    const key = [m.a, m.b].sort().join("|");
    // The person with more marriages numbers them.
    const hubId = spousesOf.get(m.a).length >= spousesOf.get(m.b).length ? m.a : m.b;
    const hubList = spousesOf.get(hubId);
    const otherId = hubId === m.a ? m.b : m.a;
    const number = hubList.length > 1 ? hubList.findIndex((s) => s.id === otherId) + 1 : null;
    const line = { a: m.a, b: m.b, former: !!m.former, number, points: [], badge: null };

    if (a.block && a.block === b.block) {
      const [l, r] = a.index < b.index ? [a, b] : [b, a];
      const midY = l.y + BOX_H / 2;
      if (r.index === l.index + 1) {
        const x = r.x - SPOUSE_GAP / 2;
        line.points = [[l.x + BOX_W, midY], [r.x, midY]];
        line.badge = { x, y: midY };
      } else {
        // Not side by side: the line runs over the top of the boxes in between.
        const hub = nodes.get(hubId);
        const other = nodes.get(otherId);
        const level = levels.get(hubId) || 0;
        levels.set(hubId, level + 1);
        const y = hub.y - 14 - level * 9;
        const x = other.index > hub.index ? other.x - SPOUSE_GAP / 2 : other.x + BOX_W + SPOUSE_GAP / 2;
        line.points = [[centreX(hub), hub.y], [centreX(hub), y], [centreX(other), y], [centreX(other), other.y]];
        line.badge = { x, y };
      }
    } else {
      // Different rows (rare): a straight line between the two boxes.
      const [t, u] = a.y <= b.y ? [a, b] : [b, a];
      line.points = [[centreX(t), t.y + BOX_H], [centreX(u), u.y]];
      line.badge = { x: (centreX(t) + centreX(u)) / 2, y: (t.y + BOX_H + u.y) / 2 };
    }
    pairDrop.set(key, line.badge);
    spouseLines.push(line);
  }

  // Lines from parents down to their children.
  const families = new Map();
  for (const [id, n] of nodes) {
    const ps = parentsOf.get(id).filter((p) => nodes.has(p));
    if (!ps.length) continue;
    const key = [...ps].sort().join("|");
    if (!families.has(key)) families.set(key, { key, parents: ps, children: [] });
    families.get(key).children.push(n);
  }
  const groups = [];
  for (const fam of families.values()) {
    const pns = fam.parents.map((p) => nodes.get(p));
    let drop;
    if (pns.length === 2 && pairDrop.has(fam.key)) drop = pairDrop.get(fam.key);
    else if (pns.length === 2) drop = { x: (centreX(pns[0]) + centreX(pns[1])) / 2, y: Math.max(pns[0].y, pns[1].y) + BOX_H };
    else drop = { x: centreX(pns[0]), y: pns[0].y + BOX_H };
    const rowBottom = Math.max(...pns.map((n) => n.y)) + BOX_H;
    const xs = fam.children.map(centreX);
    groups.push({ fam, drop, rowBottom, left: Math.min(drop.x, ...xs), right: Math.max(drop.x, ...xs) });
  }
  // Where families in the same row overlap, their crossbars are moved up or down a little.
  const byRow = new Map();
  for (const g of groups) {
    if (!byRow.has(g.rowBottom)) byRow.set(g.rowBottom, []);
    byRow.get(g.rowBottom).push(g);
  }
  for (const [rowBottom, list] of byRow) {
    list.sort((p, q) => p.left - q.left);
    const ends = [];
    for (const g of list) {
      let level = ends.findIndex((end) => end < g.left - 8);
      if (level === -1) { level = ends.length; ends.push(0); }
      ends[level] = g.right;
      g.level = level;
    }
    const count = ends.length;
    const step = Math.min(10, (ROW_GAP - 30) / Math.max(1, count - 1));
    for (const g of list) {
      const barY = rowBottom + ROW_GAP / 2 + (g.level - (count - 1) / 2) * step;
      for (const child of g.fam.children) {
        childLines.push({
          parents: g.fam.parents,
          child: child.id,
          points: [[g.drop.x, g.drop.y], [g.drop.x, barY], [centreX(child), barY], [centreX(child), child.y]],
        });
      }
    }
  }
  return { spouseLines, childLines };
}

// The shortest chain of links between two people, as a list of ids.
// Blood links are preferred over marriages when both are about as short.
export function pathBetween(data, fromId, toId) {
  if (!fromId || !toId || !data.people[fromId] || !data.people[toId]) return [];
  if (fromId === toId) return [fromId];
  const edges = new Map(Object.keys(data.people).map((id) => [id, []]));
  const add = (a, b, cost) => { edges.get(a)?.push([b, cost]); edges.get(b)?.push([a, cost]); };
  for (const l of data.parents) if (edges.has(l.parent) && edges.has(l.child)) add(l.parent, l.child, 1);
  for (const l of data.spouses) if (edges.has(l.a) && edges.has(l.b)) add(l.a, l.b, 1.3);
  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const done = new Set();
  while (true) {
    let cur = null;
    for (const [id, d] of dist) if (!done.has(id) && (cur === null || d < dist.get(cur))) cur = id;
    if (cur === null) return [];
    if (cur === toId) break;
    done.add(cur);
    for (const [n, cost] of edges.get(cur)) {
      const d = dist.get(cur) + cost;
      if (!dist.has(n) || d < dist.get(n)) { dist.set(n, d); prev.set(n, cur); }
    }
  }
  const path = [toId];
  while (path[0] !== fromId) path.unshift(prev.get(path[0]));
  return path;
}
