/*
 * docs-rail.js — the contents rail's one behaviour: say which entry you are reading
 * ---------------------------------------------------------------------------
 * Never ships with the system. It is part of the documentation's presentation,
 * like docs.css and docs.js, and it is a FILE OF ITS OWN because it is the only
 * part of that presentation a page can want on its own.
 *
 * docs.js does five things and four of them assume this page: it fills the
 * swatch grid, renders three token tables, wires the copy buttons, and builds
 * the contents list. Anything reaching for it on a page without a #swatches
 * element gets a null dereference rather than a rail. A site rendering these
 * documents hits that immediately — it has its own pages, with contents rails
 * and no token tables — so the one behaviour those pages share is separated
 * here and imported by both.
 *
 * A NO-OP WHERE THE PARTS ARE MISSING. No rail, no scroll region, or a rail with
 * no resolvable targets, and this returns having done nothing. That is what lets
 * a page import it without first proving it has furniture.
 */

export function markCurrentEntry({
  toc = document.querySelector("#docs-toc"),
  region = document.querySelector(".docs-scroll"),
} = {}) {
  if (!toc || !region) return;

  /* THE RAIL IS THE SOURCE OF THE LIST, not the document. Every entry names its
     target in its own href, so resolving those is the one reading that cannot
     fall out of step with what is on screen — and it works whether the rail was
     built by a script or served ready-made by a host that rendered it earlier. */
  const entries = [...toc.querySelectorAll("a[href^='#']")]
    .map((a) => ({ a, target: document.getElementById(a.getAttribute("href").slice(1)) }))
    .filter((e) => e.target);

  if (!entries.length) return;

  /* THE READING LINE IS READ OFF THE ANCHOR ITSELF, not rebuilt from the tokens
     that set it. docs.css gives every anchor target a scroll-margin-block-start
     of the bar plus one gap; the browser resolves that to pixels, and asking the
     element for it returns the very number the browser will use to land a jump.
     There is no second copy of the arithmetic and nothing to keep in step.

     It was computed from the tokens first, and that was wrong twice over.
     --docs-bar-height does not resolve on :root at all — it is declared further
     in — so getPropertyValue returned "" and the guard turned it into 0; and a
     custom property comes back as its written text anyway, so
     parseFloat("2.625rem") is 2.625, not 42. The line landed at 1px instead of
     58 and the rail lit the entry ABOVE the one you clicked. Both faults are
     invisible in the source and obvious the moment the number is measured. */
  const readingLine = (el) => parseFloat(getComputedStyle(el).scrollMarginBlockStart) || 0;

  let marked = null;

  const update = () => {
    const line = region.getBoundingClientRect().top + readingLine(entries[0].target);

    /* The last heading whose top has reached the line. Before the first one
       does, the first entry stands — a reader at the top of a document is
       reading its opening, not nothing. */
    let current = entries[0];
    for (const e of entries) {
      if (e.target.getBoundingClientRect().top <= line + 1) current = e;
      else break;
    }

    /* AT THE BOTTOM, THE LAST ENTRY WINS, whatever the arithmetic says. The
       final heading may sit above the line and never reach it, because there is
       not a screenful of document left to push it up there. Without this the
       last entries in a rail can never light at all — and they are the ones a
       reader scrolling to the end is looking at. */
    const room = region.scrollHeight - region.clientHeight;
    if (room > 0 && region.scrollTop >= room - 2) current = entries.at(-1);

    if (current.a === marked) return;
    marked?.removeAttribute("aria-current");
    /* MARKED WITH aria-current, NOT WITH A CLASS OF ITS OWN. The platform has a
       word for this state and the styling hangs off that word, so the thing a
       screen reader announces and the thing the eye sees cannot drift apart. The
       value is `location` rather than `page` on purpose: `page` means this link
       points at the page you are on, which is a different claim and one a site's
       own navigation is already making elsewhere. */
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

  region.addEventListener("scroll", onScroll, { passive: true });
  /* A resize reflows the document, so every heading is somewhere else. */
  addEventListener("resize", onScroll);
  /* And once now, because a reload can restore a scroll position partway down a
     document the rail would otherwise describe as unstarted. */
  update();
}
