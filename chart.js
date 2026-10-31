// chart.js
// Draws the family chart and lets you move around it:
// drag to move, pinch or Cmd/Ctrl-scroll to zoom, and the + / − / centre buttons.
// Where things go is worked out in layout.js.

import { layoutTree, pathBetween, BOX_W, BOX_H } from "./layout.js";

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const SVG_NS = "http://www.w3.org/2000/svg";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// container: the element the chart fills.
// options.onSelect(id): a box was tapped. options.onEmpty(): empty space was tapped.
// options.insets(): how much of the chart is covered by the person panel { right, bottom }.
export function createChart(container, { onSelect, onEmpty, insets }) {
  const world = document.createElement("div");
  world.className = "chart-world";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("chart-lines");
  const boxes = document.createElement("div");
  world.append(svg, boxes);
  container.append(world);

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let layout = null;
  let data = null;
  let meId = null;
  let selectedId = null;
  const listeners = new Set();

  function apply({ animate = false } = {}) {
    world.classList.toggle("animate", animate);
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    listeners.forEach((fn) => fn(scale));
  }

  // The part of the chart that is not covered by the panel.
  function visibleArea() {
    const r = container.getBoundingClientRect();
    const cover = insets ? insets() : { right: 0, bottom: 0 };
    return { w: r.width - cover.right, h: r.height - cover.bottom };
  }

  function zoomAt(px, py, newScale, opts) {
    newScale = clamp(newScale, MIN_SCALE, MAX_SCALE);
    const wx = (px - tx) / scale;
    const wy = (py - ty) / scale;
    scale = newScale;
    tx = px - wx * scale;
    ty = py - wy * scale;
    apply(opts);
  }

  function zoomBy(factor) {
    const v = visibleArea();
    zoomAt(v.w / 2, v.h / 2, scale * factor, { animate: true });
  }

  // Box position on screen, or null.
  function boxOnScreen(id) {
    const n = layout?.nodes.get(id);
    if (!n) return null;
    return { x: tx + n.x * scale, y: ty + n.y * scale, w: BOX_W * scale, h: BOX_H * scale };
  }

  function centreOn(id, { animate = true, onlyIfHidden = false } = {}) {
    const n = layout?.nodes.get(id);
    if (!n) return;
    const v = visibleArea();
    if (onlyIfHidden) {
      const b = boxOnScreen(id);
      const m = 16;
      if (b.x >= m && b.y >= m && b.x + b.w <= v.w - m && b.y + b.h <= v.h - m) return;
    }
    tx = v.w / 2 - (n.x + BOX_W / 2) * scale;
    ty = v.h / 2 - (n.y + BOX_H / 2) * scale;
    apply({ animate });
  }

  // ---- Drawing ----

  function draw() {
    layout = layoutTree(data);
    const pad = 40;
    svg.setAttribute("width", layout.width + pad * 2);
    svg.setAttribute("height", layout.height + pad * 2);
    svg.style.left = -pad + "px";
    svg.style.top = -pad + "px";
    svg.setAttribute("viewBox", `${-pad} ${-pad} ${layout.width + pad * 2} ${layout.height + pad * 2}`);

    // The chain of people between you and the person tapped is drawn in gold.
    const path = selectedId ? pathBetween(data, meId, selectedId) : [];
    const onPath = new Set(path);
    const linked = (a, b) => path.some((id, i) => (id === a && path[i + 1] === b) || (id === b && path[i + 1] === a));

    const grey = [];
    const gold = [];
    const badges = [];
    for (const line of layout.lines.childLines) {
      const isGold = line.parents.some((p) => linked(p, line.child));
      (isGold ? gold : grey).push(polyline(line.points, isGold ? "gold" : "plain"));
    }
    for (const line of layout.lines.spouseLines) {
      const isGold = linked(line.a, line.b);
      const cls = (isGold ? "gold" : "plain") + (line.former ? " former" : "");
      (isGold ? gold : grey).push(polyline(line.points, cls));
      if (line.number) badges.push(badge(line.badge, line.number, cls));
    }
    svg.replaceChildren(...grey, ...gold, ...badges);

    const els = [];
    for (const n of layout.nodes.values()) {
      const p = data.people[n.id];
      const rest = [p.father, p.family].filter(Boolean).join(" ");
      const box = document.createElement("button");
      box.type = "button";
      box.className = "box";
      if (n.id === meId) box.classList.add("me");
      if (onPath.has(n.id)) box.classList.add("on-path");
      if (n.id === selectedId) box.classList.add("selected");
      box.dataset.id = n.id;
      box.style.left = n.x + "px";
      box.style.top = n.y + "px";
      box.setAttribute("aria-label", [p.first, rest].filter(Boolean).join(" ") + (n.id === meId ? ", you" : ""));
      const first = document.createElement("span");
      first.className = "box-first";
      first.textContent = p.first;
      box.append(first);
      if (rest) {
        const sub = document.createElement("span");
        sub.className = "box-rest";
        sub.textContent = rest;
        box.append(sub);
      }
      if (n.id === meId) {
        const tag = document.createElement("span");
        tag.className = "box-you";
        tag.textContent = "You";
        box.append(tag);
      }
      els.push(box);
    }
    boxes.replaceChildren(...els);
  }

  function polyline(points, cls) {
    const el = document.createElementNS(SVG_NS, "polyline");
    el.setAttribute("points", points.map((p) => p.join(",")).join(" "));
    el.setAttribute("class", cls);
    return el;
  }

  function badge(at, number, cls) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "badge " + cls);
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", at.x);
    c.setAttribute("cy", at.y);
    c.setAttribute("r", 8);
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", at.x);
    t.setAttribute("y", at.y);
    t.textContent = number;
    g.append(c, t);
    return g;
  }

  // ---- Moving and zooming ----

  const pointers = new Map();
  let drag = null; // { x, y, tx, ty } where a one-finger drag started
  let pinch = null; // { dist, mx, my, scale, tx, ty }
  let moved = false;
  let swallowClick = false;

  const local = (e) => {
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function startPinch() {
    const [a, b] = [...pointers.values()];
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, scale, tx, ty,
    };
  }

  container.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      const p = local(e);
      drag = { x: p.x, y: p.y, tx, ty };
      moved = false;
      swallowClick = false;
    } else if (pointers.size === 2) {
      moved = true;
      swallowClick = true;
      startPinch();
      for (const id of pointers.keys()) {
        try { container.setPointerCapture(id); } catch {}
      }
    }
  });

  container.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const s = clamp(pinch.scale * (dist / pinch.dist), MIN_SCALE, MAX_SCALE);
      const wx = (pinch.mx - pinch.tx) / pinch.scale;
      const wy = (pinch.my - pinch.ty) / pinch.scale;
      scale = s;
      tx = mx - wx * s;
      ty = my - wy * s;
      apply();
      return;
    }
    if (!drag) return;
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    if (!moved && Math.hypot(dx, dy) > 6) {
      moved = true;
      swallowClick = true;
      container.classList.add("dragging");
      try { container.setPointerCapture(e.pointerId); } catch {}
    }
    if (moved) {
      tx = drag.tx + dx;
      ty = drag.ty + dy;
      apply();
    }
  });

  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      // One finger lifted after a pinch: carry on dragging with the other.
      const [p] = pointers.values();
      drag = { x: p.x, y: p.y, tx, ty };
      pinch = null;
    } else if (pointers.size === 0) {
      drag = null;
      pinch = null;
      container.classList.remove("dragging");
    }
  };
  container.addEventListener("pointerup", release);
  container.addEventListener("pointercancel", release);

  // A drag should not count as a tap.
  container.addEventListener("click", (e) => {
    if (swallowClick) {
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    const box = e.target.closest(".box");
    if (box) onSelect(box.dataset.id);
    else if (!e.target.closest(".chart-controls")) onEmpty();
  }, true);

  // Mouse wheel and Mac trackpad: scroll moves, pinch or Cmd/Ctrl-scroll zooms.
  container.addEventListener("wheel", (e) => {
    if (e.target.closest(".chart-controls")) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.ctrlKey || e.metaKey) {
      const p = local(e);
      zoomAt(p.x, p.y, scale * Math.exp(-clamp(e.deltaY * unit, -30, 30) * 0.01));
    } else {
      tx -= e.deltaX * unit;
      ty -= e.deltaY * unit;
      apply();
    }
  }, { passive: false });

  // Safari on Mac sends trackpad pinches as "gesture" events.
  let gestureStart = null;
  container.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    gestureStart = pointers.size ? null : scale; // on iPhone the finger events already handle it
  });
  container.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    if (gestureStart == null) return;
    const p = local(e);
    zoomAt(p.x, p.y, gestureStart * e.scale);
  });
  container.addEventListener("gestureend", (e) => e.preventDefault());

  return {
    // Draw the tree. Keeps the person in `keep` at the same spot on screen.
    update(newData, { keep } = {}) {
      const before = keep ? boxOnScreen(keep) : null;
      data = newData;
      meId = newData.meId;
      if (selectedId && !newData.people[selectedId]) selectedId = null;
      draw();
      const after = keep ? layout.nodes.get(keep) : null;
      if (before && after) {
        tx = before.x - after.x * scale;
        ty = before.y - after.y * scale;
        apply();
      }
    },
    select(id) {
      selectedId = id;
      draw();
    },
    centreOn,
    zoomBy,
    setScale(s) { scale = clamp(s, MIN_SCALE, MAX_SCALE); apply(); },
    panBy(dx, dy) { tx += dx; ty += dy; apply({ animate: true }); },
    get scale() { return scale; },
    onZoom(fn) { listeners.add(fn); fn(scale); },
  };
}
