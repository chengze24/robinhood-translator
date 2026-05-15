console.log("[Robinhood Translator] loaded on:", window.location.href);

const TOOLTIP_ID = "rh-translator-tooltip";

// Create or reuse the tooltip element
function getTooltip() {
  let tip = document.getElementById(TOOLTIP_ID);
  if (!tip) {
    tip = document.createElement("div");
    tip.id = TOOLTIP_ID;
    Object.assign(tip.style, {
      position: "fixed",
      background: "#fff",
      color: "#222",
      border: "1px solid #ccc",
      borderRadius: "6px",
      padding: "8px",
      fontSize: "14px",
      maxWidth: "320px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      zIndex: "999999",
      pointerEvents: "auto",
    });
    document.body.appendChild(tip);
  }
  return tip;
}

// Position tooltip just below the selection range
function positionTooltip(tip, range) {
  const rect = range.getBoundingClientRect();
  tip.style.left = `${rect.left}px`;
  tip.style.top = `${rect.bottom + 6}px`;
}

function removeTooltip() {
  document.getElementById(TOOLTIP_ID)?.remove();
}

// Dismiss on click outside the tooltip
document.addEventListener("mousedown", (e) => {
  const tip = document.getElementById(TOOLTIP_ID);
  if (tip && !tip.contains(e.target)) removeTooltip();
});

// Selection handling
document.addEventListener("mouseup", async () => {
  const selection = window.getSelection();
  const text = selection?.toString().trim();

  if (!text || text.length <= 1) return;

  const range = selection.getRangeAt(0);
  const tip = getTooltip();
  tip.textContent = "Translating…";
  positionTooltip(tip, range);

  // Fetch translation
  try {
    const res = await fetch("http://localhost:8000/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Re-anchor in case DOM shifted; tooltip may already be removed
    if (document.getElementById(TOOLTIP_ID)) tip.textContent = data.translation;
  } catch {
    if (document.getElementById(TOOLTIP_ID)) tip.textContent = "Translation failed";
  }
});
