/*
 * docs.js — renders the foundation tables on this page
 * ---------------------------------------------------------------------------
 * Never ships with the system. It exists for one reason: a documentation page
 * that hardcodes its own swatches and rungs is a second copy of the tokens, and
 * a value copied is a value that will drift. Everything below reads the real
 * computed values out of the live stylesheet, so a wrong token shows up here as
 * a wrong swatch rather than as a page that still looks right.
 *
 * Token NAMES are listed here; token VALUES are never written here.
 */

const root = document.documentElement;

/* --- Colour --------------------------------------------------------------- */

const SWATCHES = [
  ["--ink", "text"],
  ["--sub", "muted text — always ink at 40%, never a grey"],
  ["--page", "the field the sheets lie on"],
  ["--surface", "a sheet"],
  ["--hairline", "the universal rule"],
  ["--accent", "you are here — a state, not an outcome"],
  ["--emerald", "it landed"],
  ["--ruby", "it did not land"],
  ["--topaz", "still happening"],
];

const swatches = document.querySelector("#swatches");

for (const [token, role] of SWATCHES) {
  const el = document.createElement("figure");
  el.className = "docs-swatch";
  el.innerHTML = `
    <div class="docs-swatch__chip" style="background-color: var(${token})"></div>
    <figcaption class="docs-swatch__name">${token}</figcaption>
    <span class="docs-swatch__role">${role}</span>
    <span class="docs-swatch__role" data-resolved></span>
  `;
  swatches.append(el);
}

/* Resolve after insertion — light-dark() only collapses to a real colour once
   the element is in the document and has a used colour-scheme. */
function paintResolvedValues() {
  for (const chip of swatches.querySelectorAll(".docs-swatch__chip")) {
    const resolved = getComputedStyle(chip).backgroundColor;
    chip.parentElement.querySelector("[data-resolved]").textContent = resolved;
  }
}

/* --- Type ----------------------------------------------------------------- */

const FACES = [
  ["--font-body", "All chrome, in the label's own case — and body prose"],
  ["--font-display", "Every heading level, H1–H6, and blockquote"],
  ["--font-mono", "Source text only — never merely “technical”"],
  ["--font-numeral", "Numerals only — figures, counters, versions"],
];

const faces = document.querySelector("#faces");

for (const [token, job] of FACES) {
  const dt = document.createElement("dt");
  dt.style.fontFamily = `var(${token})`;
  dt.textContent = "Ag 0123";

  const dd = document.createElement("dd");
  dd.innerHTML = `<code>${token}</code> — ${job}`;

  faces.append(dt, dd);
}

/* --- Space ---------------------------------------------------------------- */

const RUNGS = [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80];

/* --- Grouping tiers ------------------------------------------------------- */

const TIERS = [
  ["--gap-tight", "a thing sitting ON what it introduces"],
  ["--gap-within", "between items of one group"],
  ["--gap-between", "between groups"],
  ["--gap-section", "between sections — where a rule used to be"],
];

const grouping = document.querySelector("#grouping");

for (const [token, meaning] of TIERS) {
  const probe = document.createElement("div");
  probe.style.width = `var(${token})`;
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).width);
  probe.remove();

  const row = document.createElement("div");
  row.className = "docs-rung";
  row.innerHTML = `
    <span class="docs-rung__name" style="inline-size: 9rem">${token}</span>
    <span class="docs-rung__bar" style="inline-size: var(${token})"></span>
    <span class="docs-rung__px">${px}px — ${meaning}</span>
  `;
  grouping.append(row);
}

const scale = document.querySelector("#scale");
const rootFontSize = parseFloat(getComputedStyle(root).fontSize);

for (const n of RUNGS) {
  const token = `--space-${n}`;
  const probe = document.createElement("div");
  probe.style.width = `var(${token})`;
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).width);
  probe.remove();

  const row = document.createElement("div");
  row.className = "docs-rung";
  /* The name is the pixel count. If these two disagree, the rung is lying. */
  const honest = px === n;
  row.innerHTML = `
    <span class="docs-rung__name">${token}</span>
    <span class="docs-rung__bar" style="inline-size: var(${token})"></span>
    <span class="docs-rung__px">${px}px${honest ? "" : " — MISMATCH"}</span>
  `;
  if (!honest) row.querySelector(".docs-rung__px").style.color = "var(--ruby)";
  scale.append(row);
}

if (rootFontSize !== 16) {
  console.warn(
    `[kds] Root font size is ${rootFontSize}px, not 16px. The rem values are ` +
      `correct; the pixel figures shown on this page are scaled accordingly.`,
  );
}

/* --- Colour-scheme toggle -------------------------------------------------
   Cycles auto → light → dark. Auto is first because the system preference is
   the honest default, and a design system whose docs pin one scheme stops
   catching the bugs that only exist in the other. */

const MODES = ["auto", "light", "dark"];
const LABELS = { auto: "Auto", light: "Light", dark: "Dark" };

const toggle = document.querySelector("#scheme-toggle");
const label = document.querySelector("#scheme-label");

function setScheme(mode) {
  root.dataset.scheme = mode;
  label.textContent = LABELS[mode];
  toggle.setAttribute("aria-pressed", String(mode !== "auto"));
  /* light-dark() resolves against the used scheme, so re-read after the swap —
     but synchronously. getComputedStyle already forces a style flush, so the
     new scheme is visible to it immediately. Deferring this to rAF bought
     nothing and made the swatches empty for one frame, which is a real state
     the page can be observed in: any reader fast enough to look before that
     frame sees a table of blank values. */
  paintResolvedValues();
}

toggle.addEventListener("click", () => {
  const next = MODES[(MODES.indexOf(root.dataset.scheme) + 1) % MODES.length];
  setScheme(next);
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (root.dataset.scheme === "auto") paintResolvedValues();
});

setScheme("auto");

/* --- The local rail: a contents list built from the document --------------
   Read out of the headings rather than written by hand. A hand-written contents
   list is a second copy of the document, and a value copied is a value that
   will drift — the entry outlives the section it points at and nobody notices,
   because a stale link still looks like a link.

   Ids are generated where a heading has none, so an author does not have to
   remember to add one for the rail to work. */
const toc = document.querySelector("#docs-toc");

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

if (toc) {
  const headings = [...document.querySelectorAll("main :is(h1, h2, h3)")];

  for (const h of headings) {
    if (!h.id) h.id = slug(h.textContent) || `s-${headings.indexOf(h)}`;

    const li = document.createElement("li");
    li.dataset.depth = h.tagName[1];

    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = h.textContent;
    /* A section title is an h1 and so is the banner; the rail leans on weight
       rather than size, because the rail is small everywhere. */
    if (h.tagName === "H1") a.style.fontWeight = "var(--weight-strong)";

    li.append(a);
    toc.append(li);
  }
}

/* --- Keep the bar and the content on the same edges -----------------------
   The bar is outside the scroll region, so nothing makes their widths agree by
   itself: the region loses a scrollbar's width and the bar does not. Measure it
   and hand it to CSS, which has no way to ask.

   offsetWidth minus clientWidth is the reserved gutter. It is 0 on platforms
   with overlay scrollbars, which is the right answer there — there is nothing
   to reserve. */
const scrollRegion = document.querySelector(".docs-scroll");

function measureScrollbar() {
  if (!scrollRegion) return;
  const width = scrollRegion.offsetWidth - scrollRegion.clientWidth;
  root.style.setProperty("--scrollbar-width", `${width}px`);
}

measureScrollbar();
addEventListener("resize", measureScrollbar);

/* Read the values once more after load. styles.css pulls its six layers in with
   @import, and an imported sheet can still be in flight when a deferred module
   runs — so the first read can land before the system has been applied and
   print the unstyled value. Harmless when the styles were already there, and
   the difference between a correct table and a quietly wrong one when not. */
addEventListener("load", paintResolvedValues);
