// Journal Split Editor - robust indent/unindent and exit behavior
const container = document.getElementById("container");
const addPanelBtn = document.getElementById("addPanelBtn");

let panelCount = 0;
const maxPanels = 3;

window.addEventListener("DOMContentLoaded", () => addPanel()); // default single panel

addPanelBtn.addEventListener("click", () => {
  if (panelCount < maxPanels) addPanel();
});

function addPanel() {
  const panel = document.createElement("div");
  panel.classList.add("panel");

  const closeBtn = document.createElement("span");
  closeBtn.classList.add("close-btn");
  closeBtn.textContent = "×";

  const editor = document.createElement("div");
  editor.classList.add("editor");
  editor.contentEditable = true;
  editor.spellcheck = false;
  editor.addEventListener("keydown", handleEditorKeys);

  closeBtn.addEventListener("click", () => {
    const before = panel.previousElementSibling;
    const after = panel.nextElementSibling;
    if (before?.classList.contains("divider")) before.remove();
    else if (after?.classList.contains("divider")) after.remove();
    panel.remove();
    panelCount--;
    evenlyDistributePanels();
  });

  panel.appendChild(closeBtn);
  panel.appendChild(editor);

  if (panelCount > 0) {
    const divider = document.createElement("div");
    divider.classList.add("divider");
    enableDividerDrag(divider);
    container.appendChild(divider);
  }

  container.appendChild(panel);
  panelCount++;
  evenlyDistributePanels();
  applySettingsToPanel(panel);
}

function evenlyDistributePanels() {
  const panels = container.querySelectorAll(".panel");
  const panelWidth = 100 / panels.length;
  panels.forEach(p => (p.style.width = `${panelWidth}%`));
  // dividers keep fixed CSS width
}

function enableDividerDrag(divider) {
  let isDragging = false;
  divider.addEventListener("mousedown", () => {
    isDragging = true;
    document.body.style.cursor = "col-resize";
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.cursor = "default";
  });
  document.addEventListener("mousemove", e => {
    if (!isDragging) return;
    const prevPanel = divider.previousElementSibling;
    const nextPanel = divider.nextElementSibling;
    if (!prevPanel || !nextPanel) return;
    const rect = container.getBoundingClientRect();
    const totalWidth = rect.width;
    const offsetX = e.clientX - rect.left;
    // compute new widths based on divider position
    const prevWidth = (offsetX / totalWidth) * 100;
    const nextWidth = 100 - prevWidth;
    if (prevWidth > 8 && nextWidth > 8) {
      prevPanel.style.width = `${prevWidth}%`;
      nextPanel.style.width = `${nextWidth}%`;
    }
  });
}

/* ---------- Helper DOM/Caret utilities ---------- */
function placeCaretAtEnd(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
function placeCaretAtStart(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
function getClosestListItem(node) {
  while (node && node.nodeType === 3) node = node.parentElement; // text -> parent
  while (node && node.nodeName !== "LI") node = node.parentElement;
  return node;
}
function isEmptyListItem(li) {
  if (!li) return false;
  // trim whitespace (NB: &nbsp; becomes \u00A0). Normalize.
  const txt = (li.textContent || "").replace(/\u00A0/g, " ").trim();
  return txt === "";
}

/* ---------- Core bullet/indent/unindent/exit logic ---------- */
function handleEditorKeys(e) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const node = sel.anchorNode;

  // 1) /- + space => replace current block text node (or paragraph) with a UL>LI
  if (e.key === " " && node && (node.nodeType === 3 || node.nodeType === 1)) {
    const text = (node.nodeType === 3 ? node.textContent : node.innerText || node.textContent).trim();
    if (text === "/-") {
      e.preventDefault();
      // find parent editable block container to replace node
      // if node is text node inside editor div (no wrapper), replace that text node with ul
      let parent = node.nodeType === 3 ? node.parentNode : node;
      // create ul>li
      const li = document.createElement("li");
      li.innerHTML = "<br>";
      const ul = document.createElement("ul");
      ul.appendChild(li);
      parent.replaceChild(ul, node);
      placeCaretAtStart(li);
      return;
    }
  }

  // Tab: indent
  if (e.key === "Tab" && !e.shiftKey) {
    const li = getClosestListItem(node);
    if (li) {
      e.preventDefault();
      indentListItem(li);
      return;
    } else {
      // If not in li but user presses Tab inside editor, do nothing (or could create bullet)
      return;
    }
  }

  // Shift+Tab: unindent (single press should move up one level)
  if (e.key === "Tab" && e.shiftKey) {
    const li = getClosestListItem(node);
    if (li) {
      e.preventDefault();
      unindentListItem(li);
      return;
    }
  }

  // Enter: handle exit behavior for empty li
  if (e.key === "Enter") {
    const li = getClosestListItem(node);
    if (li) {
      // if current list item is empty (or only <br>), exit list completely (not move up)
      if (isEmptyListItem(li)) {
        e.preventDefault();
        exitListAt(li);
        return;
      } else {
        // normal Enter should create a new <li> — allow default behavior or create programmatically
        // We'll let browser create a new li naturally inside the ul (most browsers do),
        // but ensure we clear any dataset flags.
        return;
      }
    }
  }

  // Backspace on empty li: remove li and place caret safely
  if (e.key === "Backspace") {
    const li = getClosestListItem(node);
    if (li && isEmptyListItem(li)) {
      e.preventDefault();
      const ul = li.parentElement;
      const parentLi = ul.closest("li");
      const next = li.nextElementSibling;
      li.remove();
      cleanupEmptyUlsUpwards(ul);
      // place caret: if there is next sibling, focus it; else if parentLi exists, focus parentLi; else create a paragraph
      if (next) placeCaretAtStart(next);
      else if (parentLi) placeCaretAtEnd(parentLi);
      else {
        // top-level list became empty -> insert a paragraph
        const editor = findClosestEditor(ul);
        const p = document.createElement("div");
        p.innerHTML = "<br>";
        ul.parentElement.insertBefore(p, ul.nextSibling);
        ul.remove();
        placeCaretAtStart(p);
      }
      return;
    }
  }
}

/* ---------- indent helper that works without previous sibling ---------- */
function indentListItem(li) {
  const prev = li.previousElementSibling;
  if (prev) {
    // move li into prev's nested ul
    let nested = prev.querySelector(":scope > ul");
    if (!nested) {
      nested = document.createElement("ul");
      prev.appendChild(nested);
    }
    nested.appendChild(li);
    placeCaretAtEnd(li);
  } else {
    // no previous sibling: create a new placeholder li above and put current li under it
    const placeholder = document.createElement("li");
    placeholder.innerHTML = "<br>";
    const parentUl = li.parentElement;
    parentUl.insertBefore(placeholder, li);
    const nested = document.createElement("ul");
    placeholder.appendChild(nested);
    nested.appendChild(li);
    placeCaretAtEnd(li);
  }
}

/* ---------- unindent helper: move li up one level and keep caret in li ---------- */
function unindentListItem(li) {
  const parentUl = li.parentElement;
  const grandLi = parentUl.closest("li"); // the <li> that contains parentUl, if any
  if (grandLi) {
    // move li to be sibling (after) of grandLi
    grandLi.parentElement.insertBefore(li, grandLi.nextSibling);
    cleanupEmptyUlsUpwards(parentUl);
    placeCaretAtEnd(li);
  } else {
    // parentUl is top-level (its parent is editor). Unindenting top-level li -> convert li to paragraph
    const editor = findClosestEditor(parentUl);
    if (editor) {
      const p = document.createElement("div");
      // preserve inline contents (text, nodes) of li
      while (li.firstChild) p.appendChild(li.firstChild);
      // ensure at least <br> so caret can land
      if (p.innerHTML.trim() === "") p.innerHTML = "<br>";
      parentUl.parentElement.insertBefore(p, parentUl.nextSibling);
      li.remove();
      cleanupEmptyUlsUpwards(parentUl);
      placeCaretAtStart(p);
    }
  }
}

/* ---------- exit list completely when pressing Enter on empty li ---------- */
function exitListAt(li) {
  const ul = li.parentElement;
  const rootUl = findRootUl(ul); // topmost UL in this chain
  const editor = findClosestEditor(rootUl);
  // insert a normal block (div) after the root ul and remove the (empty) li and clean empty uls
  const p = document.createElement("div");
  p.innerHTML = "<br>";
  rootUl.parentElement.insertBefore(p, rootUl.nextSibling);
  // remove li and cleanup
  li.remove();
  cleanupEmptyUlsUpwards(ul);
  // if rootUl is empty now, remove it
  if (rootUl.childElementCount === 0) rootUl.remove();
  placeCaretAtStart(p);
}

/* ---------- helpers to find root UL and editor container ---------- */
function findRootUl(ul) {
  let current = ul;
  while (current && current.parentElement) {
    const parent = current.parentElement;
    if (parent.nodeName === "LI") {
      current = parent.parentElement; // move up to the UL that contains the parent LI
    } else break;
  }
  return current;
}
function findClosestEditor(node) {
  while (node && !node.classList?.contains?.("editor")) node = node.parentElement;
  return node;
}

/* ---------- cleanup empty UL nodes up the tree (remove empty ULs and their empty LI parents) ---------- */
function cleanupEmptyUlsUpwards(ul) {
  let current = ul;
  while (current && current.nodeName === "UL") {
    if (current.childElementCount === 0) {
      const parentLi = current.parentElement;
      current.remove();
      // if parentLi exists and is now empty (no children text), remove it and continue up
      if (parentLi && parentLi.nodeName === "LI") {
        // if parentLi has no child UL and its text is empty, remove it
        const text = (parentLi.textContent || "").trim();
        if (text === "") {
          const parentUl = parentLi.parentElement;
          parentLi.remove();
          current = parentUl; // continue upward
          continue;
        } else break;
      } else break;
    } else break;
  }
}

/* ---------- Settings (simple persistence) ---------- */
const fontSizeInput = document.getElementById("fontSize");
const fontColorInput = document.getElementById("fontColor");
const bgColorInput = document.getElementById("bgColor");
const fontSelect = document.getElementById("fontSelect");

function applySettingsToPanel(panel) {
  const editor = panel.querySelector(".editor");
  const settings = JSON.parse(localStorage.getItem("journalSettings")) || {};
  if (settings.fontSize) editor.style.fontSize = settings.fontSize + "px";
  if (settings.fontColor) editor.style.color = settings.fontColor;
  if (settings.bgColor) panel.style.background = settings.bgColor;
  if (settings.fontFamily) editor.style.fontFamily = settings.fontFamily;
}

function applySettingsToAll() {
  const panels = document.querySelectorAll(".panel .editor");
  panels.forEach(editor => {
    editor.style.fontSize = fontSizeInput.value + "px";
    editor.style.color = fontColorInput.value;
    editor.style.fontFamily = fontSelect.value;
    editor.parentElement.style.background = bgColorInput.value;
  });
  localStorage.setItem("journalSettings", JSON.stringify({
    fontSize: fontSizeInput.value,
    fontColor: fontColorInput.value,
    bgColor: bgColorInput.value,
    fontFamily: fontSelect.value
  }));
}

[fontSizeInput, fontColorInput, bgColorInput, fontSelect].forEach(el =>
  el?.addEventListener("input", applySettingsToAll)
);

window.addEventListener("load", () => {
  const settings = JSON.parse(localStorage.getItem("journalSettings")) || {};
  if (settings.fontSize) fontSizeInput.value = settings.fontSize;
  if (settings.fontColor) fontColorInput.value = settings.fontColor;
  if (settings.bgColor) bgColorInput.value = settings.bgColor;
  if (settings.fontFamily) fontSelect.value = settings.fontFamily;
});