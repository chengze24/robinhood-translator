console.log("[Robinhood Translator] loaded on:", window.location.href);

const TRANSLATE_URL = "https://g7qurbrxgk.execute-api.us-east-1.amazonaws.com/translate";

// Two separate IDs so both tooltips can live in the DOM simultaneously.
const SEL_TIP_ID = "rh-translator-tip-sel"; // owned by select-to-translate
const HOV_TIP_ID = "rh-translator-tip-hov"; // owned by hover-to-translate

// Per-page translation cache: source text → translated text
const cache = new Map();

// ── Tooltip helpers ──────────────────────────────────────────────────────────

function getTooltip(id) {
  let tip = document.getElementById(id);
  if (!tip) {
    tip = document.createElement("div");
    tip.id = id;
    tip._gen = 0; // per-element generation counter — see translate()
    Object.assign(tip.style, {
      position: "fixed",
      background: "#fff",
      color: "#222",
      border: "1px solid #ccc",
      borderRadius: "6px",
      padding: "8px",
      fontSize: "14px",
      maxWidth: "360px",
      maxHeight: "280px",
      overflowY: "auto",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      zIndex: "999999",
      pointerEvents: "auto",
    });
    document.body.appendChild(tip);
  }
  return tip;
}

// Works for both Range.getBoundingClientRect() and Element.getBoundingClientRect().
// Uses the known max-width (360) and max-height (280) caps to keep the tooltip
// inside the viewport without needing to measure actual rendered size.
function positionTooltipAt(tip, rect) {
  const W = 360, H = 280, PAD = 8;
  let left = rect.left;
  let top  = rect.bottom + 6;

  // Clamp horizontally.
  if (left + W > window.innerWidth  - PAD) left = window.innerWidth  - W - PAD;
  if (left < PAD) left = PAD;

  // Flip above the anchor if there is not enough room below.
  if (top + H > window.innerHeight - PAD) top = rect.top - H - 6;
  if (top < PAD) top = PAD;

  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
}

function removeTooltip(id) {
  document.getElementById(id)?.remove();
}

// ── Translation (cache-aware, per-tooltip generation) ────────────────────────

// Each tooltip element carries its own _gen counter.  Incrementing before
// each fetch means:
//   • A slow response for tooltip T cannot overwrite a newer response for T.
//   • Because SEL and HOV are different elements, their counters never
//     interfere — a hover response can never corrupt a selection tooltip.
// tip.isConnected catches the case where the element was removed while a
// fetch was in flight (e.g. user moved the mouse away mid-request).
async function translate(text, tip) {
  if (cache.has(text)) {
    tip.textContent = cache.get(text);
    return;
  }
  const gen = ++tip._gen;
  tip.textContent = "翻译中…";
  try {
    const res = await fetch(TRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache.set(text, data.translation);
    if (tip._gen === gen && tip.isConnected) tip.textContent = data.translation;
  } catch {
    if (tip._gen === gen && tip.isConnected) tip.textContent = "翻译失败";
  }
}

// ── CJK heuristic ────────────────────────────────────────────────────────────

// Returns true when the majority of non-whitespace chars are CJK (U+4E00–U+9FFF)
function isMostlyCJK(text) {
  const chars = [...text].filter(c => c.trim());
  if (!chars.length) return false;
  const cjkCount = chars.filter(c => c >= "一" && c <= "鿿").length;
  return cjkCount / chars.length > 0.5;
}

// ── Text-block resolution ────────────────────────────────────────────────────

// Walk up from el collecting two candidates:
//   semanticBlock — nearest <p>/<li>/<td>/heading/etc.
//   linkBlock     — nearest <a>
//
// Inline links: the <a> and its containing <p> have roughly equal text →
//   prefer the <p> (full sentence context).
// News-card links (Robinhood news): the whole card is one big <a> whose
//   combined title+summary text is much longer than any single inner element
//   → prefer the <a> when it has ≥1.5× more non-whitespace characters.
const TEXT_BLOCK_RE = /^(P|LI|TD|TH|H[1-6]|BLOCKQUOTE|FIGCAPTION|DT|DD|BUTTON)$/;
function resolveTextBlock(el) {
  // Card-link overlay pattern: Robinhood places an empty <a> on top of the
  // sibling element that holds the actual title/summary text.  The <a> itself
  // has no text, so walk upward from its parent looking for the first ancestor
  // whose own trimmed text falls in [4, 800] chars.  < 4 means we haven't
  // reached the content yet; > 800 means we've climbed into a large container.
  // Cap the walk at 5 levels to avoid scanning far up the tree.
  if (el.tagName === "A" && !(el.textContent || "").trim()) {
    let node = el.parentElement;
    for (let i = 0; i < 5 && node && node !== document.body; i++, node = node.parentElement) {
      const len = (node.textContent || "").trim().length;
      if (len >= 4 && len <= 800) return node;
    }
    // Nothing qualified — fall through to the normal logic below.
  }

  let semanticBlock = null;
  let linkBlock = null;
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (!semanticBlock && TEXT_BLOCK_RE.test(node.tagName)) semanticBlock = node;
    if (!linkBlock && node.tagName === "A") linkBlock = node;
  }
  if (linkBlock) {
    const linkLen = (linkBlock.textContent || "").replace(/\s+/g, "").length;
    const blockLen = semanticBlock
      ? (semanticBlock.textContent || "").replace(/\s+/g, "").length
      : 0;
    // Use the <a> when it holds significantly more text than the inner block
    // (news-card pattern), but not for ordinary inline hyperlinks.
    if (!semanticBlock || linkLen > blockLen * 1.5) return linkBlock;
  }
  return semanticBlock || el;
}

// ── Hover-to-translate ───────────────────────────────────────────────────────

let hoverTimer = null;
let hoverTarget = null; // element the 2-second timer is pending for

function cancelHover() {
  clearTimeout(hoverTimer);
  hoverTimer = null;
  hoverTarget = null;
}

document.addEventListener("mouseover", (e) => {
  const el = e.target;

  // Ignore events inside either tooltip — prevents translation loops.
  if (el.closest(`#${SEL_TIP_ID}, #${HOV_TIP_ID}`)) return;

  if (el === hoverTarget) return; // already timing this element
  cancelHover();
  hoverTarget = el;

  hoverTimer = setTimeout(() => {
    hoverTarget = null;
    const block = resolveTextBlock(el);
    const text  = (block.textContent || "").trim();
    // Skip: too short, mostly CJK, or no English word of 3+ letters.
    // The last check prevents UI chrome like "$0.00 ▼ 9.23%" from hitting the API.
    if (text.replace(/\s/g, "").length < 4 || isMostlyCJK(text)) return;
    if (!/[a-zA-Z]{3,}/.test(text)) return;

    const tip = getTooltip(HOV_TIP_ID);
    // Anchor near the hovered element, not the resolved block, which may be a
    // tall news card whose bottom edge is far below the cursor.
    positionTooltipAt(tip, el.getBoundingClientRect());
    translate(text, tip);
  }, 2000);
});

// ── mousedown ────────────────────────────────────────────────────────────────

document.addEventListener("mousedown", (e) => {
  // New interaction starting: always cancel hover and remove its tooltip.
  cancelHover();
  removeTooltip(HOV_TIP_ID);

  // Remove the selection tooltip only when the click is outside it, so the
  // user can still scroll or copy text within the selection tooltip.
  const selTip = document.getElementById(SEL_TIP_ID);
  if (selTip && !selTip.contains(e.target)) removeTooltip(SEL_TIP_ID);
});

// ── Select-to-translate ──────────────────────────────────────────────────────

document.addEventListener("mouseup", () => {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!text || text.length <= 1) return;

  const range = selection.getRangeAt(0);
  const tip = getTooltip(SEL_TIP_ID);
  positionTooltipAt(tip, range.getBoundingClientRect());
  translate(text, tip);
});
