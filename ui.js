// ui.js
// Small building blocks shared by the screens: making elements and the pop-up sheet.

export const sheet = document.getElementById("sheet");
const sheetBody = document.getElementById("sheet-body");

// h("p", { class: "note" }, "Hello") makes <p class="note">Hello</p>.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(child));
  }
  return el;
}

export const kicker = (text) => h("p", { class: "kicker" }, text);

export function openSheet(content) {
  sheetBody.replaceChildren(h("div", { class: "grabber", "aria-hidden": "true" }), content);
  if (!sheet.open) sheet.showModal();
  sheetBody.scrollTop = 0;
}

export function closeSheet() {
  sheet.close();
}

sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeSheet(); // tap outside the card closes it
});

// A small drawing made of lines, used on buttons. `paths` is SVG path data.
export function icon(paths, cls = "icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}
