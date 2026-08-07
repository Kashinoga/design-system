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

/* The role of each token, in the order the grounds stack: ink, then the three
   surfaces from the page up to the sheet and down into the well, then the one
   line, then the inks that mean something.

   --recessed was missing from this list, and it is not a minor omission: it is
   the ground the rails, the code blocks, the footer and every inline code word
   are cut from. A colour table that leaves out a ground the page uses in five
   places is a table a reader cannot trust. */
const SWATCHES = [
  ["--ink", "Body text and headings. The one full strength text colour."],
  ["--sub", "Muted text. Always <code>--ink</code> at 40%, never a separate grey."],
  ["--page", "The field that the sheets lie on."],
  ["--surface", "A sheet. The only white on the page."],
  [
    "--recessed",
    "A surface below the one it is on. It is a wash, not a colour, so it steps " +
      "back from whatever it is laid on: the rails on the page, a code block on the sheet.",
  ],
  [
    "--hairline",
    "A boundary that is itself the content. A separator, and the rules on a table " +
      "too wide for the eye to hold its row.",
  ],
  ["--accent", "You are here. It states a condition, never a result."],
  ["--emerald", "An outcome. It succeeded."],
  ["--ruby", "An outcome. It did not succeed."],
  ["--topaz", "An outcome. It is still in progress."],
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

const faces = document.querySelector("#docs-faces tbody");

for (const [token, job] of FACES) {
  const row = document.createElement("tr");
  /* The token is the row's HEADER, not its first cell. It is what identifies
     the row — the specimen and the job are both facts ABOUT it — and saying so
     with <th scope="row"> is what lets a screen reader announce "--font-mono,
     Job, source text only" instead of reading three unlabelled cells. */
  row.innerHTML = `
    <th scope="row"><code>${token}</code></th>
    <td style="font-family: var(${token})">Ag 0123</td>
    <td>${job}</td>
  `;
  faces.append(row);
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

const grouping = document.querySelector("#docs-grouping tbody");

/* Resolve a length token to the pixels a browser actually computed for it. The
   page must never write a token's VALUE — only its name — or the docs become a
   second copy of the tokens and drift from them. */
function resolvePx(token) {
  const probe = document.createElement("div");
  probe.style.width = `var(${token})`;
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).width);
  probe.remove();
  return px;
}

for (const [token, meaning] of TIERS) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <th scope="row"><code>${token}</code></th>
    <td class="numeral">${resolvePx(token)}px</td>
    <td><span class="docs-rung__bar" style="inline-size: var(${token})"></span></td>
    <td>${meaning}</td>
  `;
  grouping.append(row);
}

const scale = document.querySelector("#docs-scale tbody");
const rootFontSize = parseFloat(getComputedStyle(root).fontSize);

for (const n of RUNGS) {
  const token = `--space-${n}`;
  const px = resolvePx(token);

  const row = document.createElement("tr");
  /* The name is the pixel count. If these two disagree, the rung is lying. */
  const honest = px === n;
  row.innerHTML = `
    <th scope="row"><code>${token}</code></th>
    <td class="numeral">${px}px${honest ? "" : " — MISMATCH"}</td>
    <td><span class="docs-rung__bar" style="inline-size: var(${token})"></span></td>
  `;
  if (!honest) row.querySelector("td").style.color = "var(--ruby)";
  scale.append(row);
}

if (rootFontSize !== 16) {
  console.warn(
    `[kds] Root font size is ${rootFontSize}px, not 16px. The rem values are ` +
      `correct; the pixel figures shown on this page are scaled accordingly.`,
  );
}

/* --- Code blocks: a header that names the language, and a copy button ------
   Built here rather than written into the page. The button cannot copy anything
   without script, and a control that cannot act is absent, not disabled — so it
   exists only where it works. The header comes with it, because a bar holding
   one label and no control is a different thing from the bar this is.

   The language is read from data-lang on the <code>. Nothing infers it: a guess
   at the language of a sample is a fact the page would be stating without
   knowing it. */

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
</svg>`;

for (const pre of document.querySelectorAll("main pre")) {
  const code = pre.querySelector("code");
  const lang = code?.dataset.lang;
  if (!lang) continue;

  const block = document.createElement("figure");
  block.className = "docs-code";
  pre.replaceWith(block);

  const head = document.createElement("figcaption");
  head.className = "docs-code__head";

  const name = document.createElement("span");
  name.className = "docs-code__lang";
  name.textContent = lang;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "docs-code__copy";
  /* The icon is decorative and the label is the accessible name. A button whose
     only content is a glyph has no name at all, and "copy" spoken aloud without
     saying what is being copied is barely better. */
  button.innerHTML = `${COPY_ICON}<span class="visually-hidden">Copy the ${lang} sample</span>`;
  /* The hover tip is the short form. The accessible name above stays the long
     one, because a reader who cannot see the tip needs to know WHICH sample. */
  button.dataset.tip = "Copy";
  /* Last thing in its row, so the tip hangs from that end rather than being
     centred. Centred, it overflowed the page at 320px — an absolutely
     positioned tip still contributes to scrollable overflow at opacity 0. */
  button.dataset.tipAlign = "end";

  /* aria-live on a separate element, not on the button. Changing a button's own
     label while it has focus makes a screen reader re-announce the control the
     user is standing on, which reads as the button having changed identity. */
  const status = document.createElement("span");
  status.className = "docs-code__status";
  status.setAttribute("role", "status");

  head.append(name, status, button);
  block.append(head, pre);

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      status.textContent = "Copied";
    } catch {
      /* Clipboard access can be refused — an insecure origin, or a permission
         the reader declined. Say so rather than showing a success that did not
         happen; the sample is still selectable by hand. */
      status.textContent = "Press Ctrl+C";
    }
    clearTimeout(button.dataset.timer);
    button.dataset.timer = setTimeout(() => {
      status.textContent = "";
    }, 2000);
  });
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

  /* The tip says what the NEXT press does, not what the button currently reads.
     The visible label already states the current mode, so repeating it in a tip
     would spend a hover on something the reader can see. What a cycling control
     cannot show is where it goes next. */
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  toggle.dataset.tip = `Switch to ${LABELS[next]}`;
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
   remember to add one for the rail to work. Every heading on this page now
   carries its own, written in the markup — see the note on the guard below for
   why that changed.

   AN ALREADY-FILLED LIST IS LEFT ALONE. This page builds its rail after the
   document loads, which is correct here: it is one static file and there is no
   earlier moment to build it in. A host that renders these documents through a
   server has an earlier moment, and should use it — a contents list that is
   missing from the served HTML is a rail that appears a beat after the text and
   moves it, and one that no reader without JavaScript ever gets at all.

   So the rule is: whoever can build it earliest owns it. If the list arrives
   with children, this leaves them; if it arrives empty, this fills it, exactly
   as it always has. Without the guard the two would both run and the rail would
   list every heading twice. */
const toc = document.querySelector("#docs-toc");

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/* WHERE A HEADING'S LINK POINTS. Three cases, and the middle one is the whole
   reason this is not a one-liner.

   A slug that is already taken cannot simply be assigned twice: two elements
   sharing an id makes every later querySelector return whichever comes first,
   silently. That happened with the tiers table, which used to be id="grouping"
   under a heading that slugs to the same word.

   But suffixing every collision is worse than the collision. The section
   headings slug to "foundations", "structure", "components" and "principles" —
   which their own <section> elements already carry, because those are the
   page's real anchors. Suffixing produced #principles-2 pointing at the h1
   INSIDE #principles: an ugly URL for a heading whose section was sitting there
   with the right name all along.

   So: if the owner of the slug CONTAINS this heading, the heading is that
   element's title and the link belongs on the container. Only a collision with
   something unrelated earns a suffix. */
function anchorFor(heading, fallback) {
  const wanted = slug(heading.textContent) || fallback;
  const owner = wanted && document.getElementById(wanted);

  if (owner === heading) return wanted;
  /* The section this heading titles already owns the name. Point at it. */
  if (owner && owner.contains(heading)) return wanted;

  if (!owner) {
    heading.id = wanted;
    return wanted;
  }

  /* An unrelated element has the name. Number from 2, so the common case keeps
     reading as the plain word. */
  let n = 2;
  while (document.getElementById(`${wanted}-${n}`)) n++;
  heading.id = `${wanted}-${n}`;
  return heading.id;
}

if (toc && !toc.children.length) {
  const headings = [...document.querySelectorAll("main :is(h1, h2, h3)")];

  for (const h of headings) {
    const target = h.id || anchorFor(h, `s-${headings.indexOf(h)}`);

    const li = document.createElement("li");
    li.dataset.depth = h.tagName[1];

    const a = document.createElement("a");
    a.href = `#${target}`;
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

/* --- Which entry you are actually reading ---------------------------------
   The rail says what is in the document; this says where in it you are. Without
   it a long page gives a reader twelve identical links and no answer to the one
   question they are asking, which is "where am I".

   MARKED WITH aria-current, NOT WITH A CLASS OF ITS OWN. The platform has a
   word for this state and the styling hangs off that word, so the thing a
   screen reader announces and the thing the eye sees cannot drift apart. The
   value is `location` rather than `page` on purpose: `page` means this link
   points at the page you are on, which is a different claim and one the site's
   own navigation is already making elsewhere.

   THE RAIL IS THE SOURCE OF THE LIST, not the document. Every entry names its
   target in its own href, so resolving those is the one reading that cannot
   fall out of step with what is on screen — and it works whether the rail was
   built above or served ready-made by a host that rendered it earlier.

   THE READING LINE IS THE ANCHOR LINE, and that matters more than it sounds.
   docs.css lands an anchored heading at the bar plus one gap, so a heading you
   have just jumped to sits exactly there. Measuring "current" against any other
   line means clicking an entry can fail to light the entry you clicked, which
   is the one moment a reader is watching this feature closely. */
/* THE READING LINE IS READ OFF THE ANCHOR ITSELF, not rebuilt from the tokens
   that set it. docs.css gives every anchor target a scroll-margin-block-start of
   the bar plus one gap; the browser resolves that to pixels, and asking the
   element for it returns the very number the browser will use to land a jump.
   There is no second copy of the arithmetic and nothing to keep in step.

   It was computed from the tokens first, and that was wrong twice over.
   --docs-bar-height does not resolve on :root at all — it is declared further in
   — so getPropertyValue returned "" and the guard turned it into 0; and a custom
   property comes back as its written text anyway, so parseFloat("2.625rem") is
   2.625, not 42. The line landed at 1px instead of 58 and the rail lit the entry
   ABOVE the one you clicked. Both faults are invisible in the source and obvious
   the moment the number is measured. */
const readingLine = (el) => parseFloat(getComputedStyle(el).scrollMarginBlockStart) || 0;

if (toc && scrollRegion) {
  const entries = [...toc.querySelectorAll("a[href^='#']")]
    .map((a) => ({ a, target: document.getElementById(a.getAttribute("href").slice(1)) }))
    .filter((e) => e.target);

  if (entries.length) {
    let marked = null;

    const update = () => {
      const line = scrollRegion.getBoundingClientRect().top + readingLine(entries[0].target);

      /* The last heading whose top has reached the line. Before the first one
         does, the first entry stands — a reader at the top of a document is
         reading its opening, not nothing. */
      let current = entries[0];
      for (const e of entries) {
        if (e.target.getBoundingClientRect().top <= line + 1) current = e;
        else break;
      }

      /* AT THE BOTTOM, THE LAST ENTRY WINS, whatever the arithmetic says. The
         final heading may sit above the line and never reach it, because there
         is not a screenful of document left to push it up there. Without this
         the last entries in a rail can never light at all — and they are the
         ones a reader scrolling to the end is looking at. */
      const room = scrollRegion.scrollHeight - scrollRegion.clientHeight;
      if (room > 0 && scrollRegion.scrollTop >= room - 2) current = entries.at(-1);

      if (current.a === marked) return;
      marked?.removeAttribute("aria-current");
      current.a.setAttribute("aria-current", "location");
      marked = current.a;
    };

    /* Coalesced to one read per frame. A scroll handler that measures on every
       event measures many times per frame and forces a layout each time. */
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    };

    scrollRegion.addEventListener("scroll", onScroll, { passive: true });
    /* A resize reflows the document, so every heading is somewhere else. */
    addEventListener("resize", onScroll);
    /* And once now, because a reload can restore a scroll position partway down
       a document the rail would otherwise describe as unstarted. */
    update();
  }
}


/* --- The bar frosts only what is actually behind it ------------------------
   The bar overlays the scroll region, so at rest there is nothing under it: the
   document starts below the bar and a blur applied there reports a plain page.
   Frosted all the time, the bar simply looks weaker than it is.

   The class goes on once the region has moved. Four pixels rather than zero,
   because a scroller can sit at a sub-pixel offset after a resize or a restored
   position, and a bar that flickers between states at rest is worse than one
   that waits a moment. */
const superbar = document.querySelector(".docs-bar");

if (scrollRegion && superbar) {
  const markScrolled = () => {
    superbar.classList.toggle("scrolled", scrollRegion.scrollTop > 4);
  };
  /* passive: this listener never calls preventDefault, and saying so lets the
     browser start the scroll without waiting to find out. */
  scrollRegion.addEventListener("scroll", markScrolled, { passive: true });
  /* Once at load, because a reload can restore a scroll position and the bar
     would otherwise stay clear over content it is already covering. */
  markScrolled();
}
