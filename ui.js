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

// A row of two buttons where one is picked, like Son | Daughter.
export function makeSegment(label, options, picked, onPick, disabledValues = []) {
  const buttons = options.map(([value, text]) =>
    h("button", {
      type: "button",
      class: "seg",
      "aria-pressed": String(value === picked),
      disabled: disabledValues.includes(value),
      onclick: () => {
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === buttons[options.findIndex(([v]) => v === value)])));
        onPick(value);
      },
    }, text));
  return h("div", { class: "field" },
    h("span", { class: "field-label" }, label),
    h("div", { class: "segment" }, buttons));
}

// ---- A small "are you sure?" card in the middle of the screen ----
// It sits on top of everything, even an open sheet.

const confirmBox = document.getElementById("confirm");
confirmBox.addEventListener("click", (e) => {
  if (e.target === confirmBox) confirmBox.close(); // tap outside: same as Keep
});

export const trashIcon = (cls) => icon('<path d="M4 5.5h12M8 5.5V4h4v1.5M5.5 5.5l.8 11h7.4l.8-11M8.5 8.5v5.5M11.5 8.5v5.5"/>', cls);

// content: what to show. yes: the words on the red button. onYes: what it does.
export function askToConfirm({ title, body, yes, keep = "Keep", onYes }) {
  const yesBtn = h("button", { class: "btn small danger-btn with-icon", onclick: () => { confirmBox.close(); onYes(); } },
    trashIcon(), yes);
  confirmBox.replaceChildren(
    h("div", { class: "confirm-icon" }, trashIcon("icon big")),
    h("h2", { class: "confirm-title" }, title),
    ...body.filter(Boolean).map((t) => (typeof t === "string" ? h("p", {}, t) : t)),
    h("div", { class: "confirm-actions" },
      h("button", { class: "btn small keep-btn", onclick: () => confirmBox.close() }, keep),
      yesBtn));
  confirmBox.showModal();
  yesBtn.blur();
}
