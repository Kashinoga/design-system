import { test, expect } from "@playwright/test";

/*
 * The docs page is the system's only consumer, so it is also the only place the
 * system is exercised end to end. If it breaks, something in src/ broke.
 */

test("the page loads without a single console message", async ({ page }) => {
  const noise = [];
  page.on("console", (m) => noise.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => noise.push(`pageerror: ${e.message}`));

  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  /* docs.js warns if the root font size is not 16px, because the whole spacing
     scale is named in pixels at that root. A warning here is a real finding. */
  expect(noise).toEqual([]);
});

test("every stylesheet the page asks for actually arrives", async ({ page }) => {
  const failed = [];
  page.on("response", (r) => {
    if (!r.ok()) failed.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  expect(failed).toEqual([]);

  /* A 404 on an @import is silent in CSS — the rest of the sheet still applies.
     Assert the imported layers are present by their effects, not their URLs. */
  const layersApplied = await page.evaluate(() => ({
    reset: getComputedStyle(document.querySelector("h1")).marginBlockStart === "0px",
    base: getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)",
    layout: getComputedStyle(document.querySelector(".frame")).marginInline !== "0px",
  }));

  expect(layersApplied).toEqual({ reset: true, base: true, layout: true });
});

test("the favicon parses, and is not silently a parse error", async ({ page }) => {
  /* This one is here because it happened. The icon's comment named the tokens it
     was written against — and a double hyphen may not appear inside an XML
     comment, so the file was invalid and the browser drew a parse-error page
     instead of a star.

     Nothing else in this suite could see it. The page loads, the response is
     200, the content type is right, and the console stays silent, because a
     broken favicon is not a page error. Only rendering the file and looking at
     what came back catches it. */
  const response = await page.request.get("/favicon.svg");
  expect(response.status(), "the icon must be served").toBe(200);
  expect(response.headers()["content-type"]).toBe("image/svg+xml");

  await page.goto("/favicon.svg");
  const parsed = await page.evaluate(() => ({
    root: document.documentElement.tagName.toLowerCase(),
    /* Chromium and Gecko render a parse-error document; WebKit renders an empty
       one. Either way the root stops being <svg> or the marks disappear. */
    marks: document.querySelectorAll("svg path, svg polyline, svg circle").length,
  }));

  expect(parsed.root, "the document root must still be <svg>").toBe("svg");
  expect(parsed.marks, "every mark in the icon must survive the parser").toBe(4);

  /* And the page actually asks for it, in both places. An icon nobody links to
     is a file. The superbar shows the same file rather than a copy, because a
     second copy of a mark is a mark that will drift. */
  await page.goto("/index.html");
  const used = await page.evaluate(() => {
    const mark = document.querySelector(".docs-wordmark img");
    return {
      linked: document.querySelector('link[rel="icon"]')?.getAttribute("href"),
      inBar: mark?.getAttribute("src"),
      /* Decorative, and it has to be. The mark says nothing the wordmark beside
         it does not, so alt text would announce the site twice. */
      alt: mark?.getAttribute("alt"),
      painted: Math.round(mark?.getBoundingClientRect().width ?? 0),
    };
  });

  expect(used.linked).toBe("favicon.svg");
  expect(used.inBar, "the bar must use the icon file, not a copy of it").toBe("favicon.svg");
  expect(used.alt, "the mark is decorative next to the name").toBe("");
  expect(used.painted, "1.25em against a 16px wordmark").toBe(20);
});

test("the reading column is the only sheet: grey, white, grey", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  /* The desk model, ported from the Text Editor. The rails were once cut from
     the same white as the sheet, and panes in one white made the whole thing
     read as one surface with rules drawn on it — the column you READ stood level
     with the two lists that only say where you are. So the rails step back and
     the sheet is the only white left.

     Not one width moves for this. The paint changed hands; the arithmetic did
     not. */
  const desk = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor;
    const lum = (c) => {
      const [r, g, b] = c.match(/[\d.]+/g).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    return {
      shell: Math.round(box(".docs-shell").width),
      sheet: Math.round(box(".docs-column").width),
      railTrack: Math.round(box(".docs-global").width),
      text: Math.round(box("main").width),
      sheetFill: bg(".docs-column"),
      sheetLum: lum(bg(".docs-column")),
      bodyLum: lum(getComputedStyle(document.body).backgroundColor),
      /* The rail REGION is the band plus the gutter beside it — what lies
         between the shell's edge and the sheet's. */
      leftRegion: Math.round(box(".docs-column").left - box(".docs-shell").left),
      rightRegion: Math.round(box(".docs-shell").right - box(".docs-column").right),
      /* The gutter itself: painted band edge to sheet edge. */
      gutter: Math.round(box(".docs-column").left - box(".docs-global").right),
      preFill: getComputedStyle(document.querySelector("#structure pre")).backgroundColor,
    };
  });

  /* EVERY BAND IS A TRACK. The sheet is the measure plus its own margin either
     side, and it is sized that way rather than being a 768 track corrected by a
     negative margin — which is what it was, and which made the browser's grid
     overlay fall 32 inside the colour boundaries it was supposed to be showing.
     A track that needs a margin to look right was measured wrong.

     THE BANDS NO LONGER TILE THE SHELL, and that is the change the gutters
     made. This asserted a gap of exactly zero between the tracks, which was the
     right assertion while the desk was one painted slab with the sheet laid
     over its middle. The three regions are separate objects now, lying on the
     page with a little of it showing between them, so the sum has a gutter in it:

         216  +  8  +  832  +  8  +  216  =  1280
         band   gap  sheet   gap  band

     The frame is untouched at 1280 and so is the measure at 768. The band gave
     up the unit, not the sheet. */
  expect(desk.text, "the measure is untouched").toBe(768);
  expect(desk.sheet, "the sheet is the measure plus its margin").toBe(768 + 64);
  expect(desk.railTrack, "a painted band is the rail less its gutter").toBe(224 - 8);
  expect(desk.gutter, "the desk must show page between its columns").toBe(8);
  expect(desk.leftRegion, "band plus gutter is the rail region").toBe(224);
  expect(desk.rightRegion).toBe(224);
  expect(desk.leftRegion + desk.sheet + desk.rightRegion, "the regions must tile the shell").toBe(
    desk.shell,
  );
  expect(desk.shell).toBe(1280);

  /* The sheet is the lightest thing on the page in light mode — that IS the
     hierarchy, stated in colour because no amount of space can state it. */
  expect(desk.sheetFill).toBe("rgb(255, 255, 255)");
  expect(desk.sheetLum).toBeGreaterThan(desk.bodyLum);

  /* And a code block is a well pressed INTO the sheet, not another white card on
     it. It read --surface once, which was invisible the moment the text got a
     sheet of its own. */
  expect(desk.preFill, "a code block must not be the sheet's own white").not.toBe(desk.sheetFill);
});

test("nothing runs into the edge of the band it is painted on", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  /* Debt the desk created, and it did not exist a step down: a rail used to sit
     ON the page with no edge to touch, so its list starting at the frame's edge
     lined up with the text doing the same. Paint the band and that flush edge
     becomes a fault — text hard against a colour change reads as text that has
     been cut off. */
  const inset = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const shell = box(".docs-shell");
    const sheet = box(".docs-column");
    const global = box(".docs-global ul");
    const local = box(".docs-local ul");
    return {
      leftOuter: Math.round(global.left - shell.left),
      leftInner: Math.round(sheet.left - global.right),
      rightInner: Math.round(local.left - sheet.right),
      rightOuter: Math.round(shell.right - local.right),
      lists: [Math.round(global.width), Math.round(local.width)],
      sheetInset: Math.round(box("header.prose p").left - sheet.left),
      text: Math.round(box("main").width),
    };
  });

  /* One unit inside the band on every side, so the list is centred in its band:
     16 + 184 + 16 = 216.

     The INNER edges now measure one unit plus the gutter, because the gutter is
     real space between two objects rather than padding inside one. The outer
     edges are still the band's own inset and still 16. The band lost 8 to the
     gutter, so the list is 184 rather than 192. */
  const gutter = 8;
  for (const [side, px] of Object.entries(inset)) {
    if (side.endsWith("Outer")) {
      expect(px, `the rail list is flush at its ${side} edge`).toBe(16);
    }
    if (side.endsWith("Inner")) {
      expect(px, `the rail list is flush at its ${side} edge`).toBe(16 + gutter);
    }
  }
  expect(inset.lists).toEqual([184, 184]);

  /* The sheet is generous where the rail is not, and the asymmetry is the point:
     a rail is chrome and cannot spare a seventh of its band to say what the
     colour change already says. Content can. */
  expect(inset.sheetInset).toBe(32);
  expect(inset.text, "and the measure pays for none of it").toBe(768);
});

test("a rail is held off the text by a region gap, and pays for it itself", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  const regions = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const style = (s) => getComputedStyle(document.querySelector(s));
    const probe = document.createElement("div");
    document.body.append(probe);
    const token = (t) => {
      probe.style.width = `var(${t})`;
      return parseFloat(getComputedStyle(probe).width);
    };
    const region = token("--gap-region");
    const within = token("--gap-within");
    probe.remove();

    return {
      region,
      within,
      sheetInset: parseFloat(style(".docs-column").paddingInlineStart),
      /* The gutter between two painted boxes. It was zero — the regions tiled
         and the whole separation was padding INSIDE one of them — and it is a
         real grid gap now, showing the page through. What still has to hold is
         that the frame closes: band + gutter + sheet + gutter + band = 1280. */
      betweenBoxes: Math.round(box(".docs-column").left - box(".docs-global").right),
      /* And the separation the reader actually sees, rail list to page text. */
      listToText: Math.round(box("main").left - box(".docs-global ul").right),
      railBox: Math.round(box(".docs-global").width),
      railList: Math.round(box(".docs-global ul").width),
      text: Math.round(box("main").width),
      itemGrid: parseFloat(style("#swatches").columnGap),
    };
  });

  expect(regions.betweenBoxes, "the desk must show page between its boxes").toBe(8);

  /* THE GUTTER CHANGED HANDS. It used to be padding on the rail, holding the
     list off a page that had nothing between them; the sheet now owns it as its
     own margin and holds the text off its edge from the other side. Same 32, and
     it is spent once — the earlier arrangement had the rail pay it and then the
     sheet reach back over it with a negative margin, which is the thing that put
     the grid lines in the wrong place. */
  expect(regions.sheetInset).toBe(regions.region);

  /* The rail is left with its own band inset only, and the reader still sees a
     region gap plus both insets between the list and the text. */
  expect(regions.railList).toBe(regions.railBox - 2 * regions.within);
  /* Three things now lie between the list and the text: the band's own inset,
     the gutter of bare page, and the sheet's margin. It was two before the
     gutter existed. */
  expect(regions.listToText).toBe(regions.within + regions.betweenBoxes + regions.region);
  expect(regions.text, "the measure must not pay for the boundary").toBe(768);

  /* And the two gaps are DIFFERENT JOBS. An item grid holds like things and
     takes --gap-within; a rail against the text is a boundary between kinds and
     takes --gap-region. They were the same token once, which cost nothing right
     up until the region gap doubled and every swatch grid came with it. */
  expect(regions.itemGrid, "an item grid takes the within-group gap").toBe(regions.within);
  expect(regions.region, "a region gap must clear a within-group gap").toBeGreaterThanOrEqual(
    regions.within * 2,
  );
});

test("the wordmark separator is a rule, inset from the bar on all four sides", async ({ page }) => {
  await page.goto("/index.html");

  /* Ported from the superbar on kashinoga.com — dotcom is the production system
     this one is formalising, so its numbers are the specification and not a
     reference to be approximated. Measured there: a 1px rule, 18 tall, 12 from
     the top of a 42px bar and 12 from each neighbour.
     Source: apps/home/src/lib/DocsShell.svelte, .docs-brand-sep. */
  const sep = await page.evaluate(() => {
    const el = document.querySelector(".docs-sep");
    const cs = getComputedStyle(el);
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const bar = box(".docs-bar");
    const r = el.getBoundingClientRect();

    return {
      width: +r.width.toFixed(2),
      height: +r.height.toFixed(1),
      fromTop: +(r.top - bar.top).toFixed(1),
      fromBottom: +(bar.bottom - r.bottom).toFixed(1),
      before: Math.round(r.left - box(".docs-wordmark").right),
      after: Math.round(box(".docs-bar .sub").left - r.right),
      /* A filled box, not a border. Same pixels; a background cannot be
         inherited into a shorthand or half-overridden on one edge later. */
      fill: cs.backgroundColor,
      borders: [cs.borderInlineStartWidth, cs.borderInlineEndWidth],
      hairline: getComputedStyle(document.documentElement).getPropertyValue("--hairline").trim(),
      /* Empty and hidden. It is a boundary, not a word — and the clipboard
         should get the NAME of the thing, not the name with punctuation in it. */
      empty: el.textContent === "",
      hidden: el.getAttribute("aria-hidden"),
      copied: document.querySelector(".docs-lockup").textContent.replace(/\s+/g, " ").trim(),
      /* A 1px item is the cheapest thing in a flex row to shrink away. */
      shrink: cs.flexShrink,
    };
  });

  expect(sep.width).toBe(1);
  expect(sep.height, "the bar less its inset, twice").toBe(18);

  /* Inset on all four sides by the same 12, which is the whole construction: the
     length of the rule and the space around it are one decision.

     The inline pair are exact — they are a flex gap. The block pair are within a
     pixel, because the rule's LENGTH comes from the bar while its POSITION comes
     from the cap band of the words either side of it, and an engine locates a
     cap top a fraction differently. Measured: 11.90 on Chromium and Gecko, 11.27
     on WebKit.

     Those two references are deliberate rather than a muddle. The length is
     bounded by the bar so the rule cannot read as a column edge; the position
     follows the words because words are what it separates. */
  expect(Math.abs(sep.fromTop - 12), "the rule's block inset").toBeLessThan(1);
  expect(Math.abs(sep.fromBottom - 12), "the rule's block inset").toBeLessThan(1);

  /* THE INLINE PAIR IS ONE UNIT, NOT THE BLOCK INSET'S 12, and this test used to
     assert 12 on all four sides because the construction used to be one number:
     inset the rule by 12 and its height and its side spacing fall out together.

     That held while the bar carried a wordmark, a rule and one descriptor. Add a
     second destination after the rule and the bar has two horizontal spacings —
     12 around the rule, one unit between menu items — four pixels apart, which
     reads as a mistake rather than as a distinction, because it is one.

     So the axes were separated. The rule's LENGTH still answers to the bar, at
     12 top and bottom, so it cannot read as a column edge. Its side spacing
     answers to the row it sits in, like everything else in that row. One
     rhythm across the bar; the rule's height is not part of it. */
  expect(sep.before, "the rule takes the row's own gap").toBe(16);
  expect(sep.after, "the rule takes the row's own gap").toBe(16);

  /* Not full-height. Run it the whole 42 and it stops being punctuation between
     two labels and starts reading as the edge of a column — the finding
     DocsShell.svelte records in its own comment. */
  expect(sep.height, "a full-height line reads as a column rule").toBeLessThan(42);

  expect(sep.borders, "a filled box, not a border").toEqual(["0px", "0px"]);
  expect(sep.fill, "the rule is the system hairline").toBe("rgba(0, 0, 0, 0.2)");
  expect(sep.hairline).toContain("0.2");

  expect(sep.empty).toBe(true);
  expect(sep.hidden, "a separator is not a word to announce").toBe("true");
  expect(sep.copied, "the clipboard gets the name, not the punctuation").toBe(
    "Kashinoga Design System",
  );
  expect(sep.shrink, "a 1px rule must never be shrunk away").toBe("0");
});

test("chrome heights are declared, not left to the type", async ({ page }) => {
  await page.goto("/index.html");

  /* Both of these were once whatever a line box plus padding came to, and both
     came out odd — the key at 33, from 14px of type at a 1.5 ratio giving a 21px
     line box. A height nobody declared is a height that moves when a label
     changes, and it cannot promise to land on the 2px atom.

     Measured rather than read off the stylesheet, because the fault is in what
     the browser computes: the declaration can be perfect and a padding left
     behind on the same edge still adds to it. */
  const chrome = await page.evaluate(() => {
    const h = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().height);
    return { bar: h(".docs-bar"), key: h("#scheme-toggle") };
  });

  expect(chrome.bar, "the superbar").toBe(42);
  expect(chrome.key, "the key").toBe(32);

  for (const [what, px] of Object.entries(chrome)) {
    expect(px % 2, `${what} is ${px}px, which is off the 2px atom`).toBe(0);
  }
});

test("the mark sits on the cap band of the word beside it", async ({ page }) => {
  await page.goto("/index.html");

  /* The mark is centred on the CAP BAND — cap top to baseline — and not on the
     line box. The two are not the same centre, because a face carries more
     ascent than descent and the half-leading is split evenly regardless. Centred
     on the line box the mark read 0.5px high against the caps, and 2.5px high
     against the ink of a word that ends in a descender.

     Measured against the font's own metrics rather than against a screenshot, so
     this survives a change of face: the browser reports where the baseline and
     the cap top actually are, and the assertion is that the mark's centre is
     between them. */
  const aligned = await page.evaluate(() => {
    const span = document.querySelector(".docs-wordmark");
    const img = document.querySelector(".docs-mark");
    const text = [...span.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());

    /* A Range over the text node gives the LINE BOX, which is the thing being
       measured away from — the cap band has to be recovered from font metrics. */
    const range = document.createRange();
    range.selectNodeContents(text);
    const line = range.getBoundingClientRect();

    const cs = getComputedStyle(span);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const word = ctx.measureText(text.textContent.trim());
    const capital = ctx.measureText("K");

    const halfLeading =
      (line.height - (word.fontBoundingBoxAscent + word.fontBoundingBoxDescent)) / 2;
    const baseline = line.top + halfLeading + word.fontBoundingBoxAscent;
    const capTop = baseline - capital.actualBoundingBoxAscent;

    const box = img.getBoundingClientRect();
    return {
      error: box.top + box.height / 2 - (capTop + baseline) / 2,
      /* And it must still overhang the caps, or the lift has quietly become a
         resize and the mark is now the size of a letter. */
      overhangs: box.height > capital.actualBoundingBoxAscent,
    };
  });

  /* One pixel of tolerance. The engines disagree by a fraction on where a cap
     top is — measured at -0.10, 0.27 and 0.00 — and that is font metric
     rounding, not a layout fault. */
  expect(Math.abs(aligned.error), "the mark is off the cap band's centre").toBeLessThan(1);
  expect(aligned.overhangs).toBe(true);
});

test("the scheme toggle cycles auto to light to dark and back", async ({ page }) => {
  await page.goto("/index.html");

  const toggle = page.locator("#scheme-toggle");
  const html = page.locator("html");

  await expect(html).toHaveAttribute("data-scheme", "auto");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(html).toHaveAttribute("data-scheme", "light");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText("Light");

  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await toggle.click();
  await expect(html).toHaveAttribute("data-scheme", "dark");
  await expect(toggle).toHaveText("Dark");

  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).not.toBe(lightBg);

  await toggle.click();
  await expect(html).toHaveAttribute("data-scheme", "auto");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("the docs read their values from the live stylesheet, not a copy", async ({ page }) => {
  await page.goto("/index.html");

  /* Each swatch prints the resolved colour of its own chip. If the docs ever
     start hardcoding values, the printed text and the painted chip diverge. */
  const drift = await page.evaluate(() =>
    [...document.querySelectorAll(".docs-swatch")]
      .map((fig) => {
        const painted = getComputedStyle(fig.querySelector(".docs-swatch__chip")).backgroundColor;
        const printed = fig.querySelector("[data-resolved]").textContent.trim();
        return painted === printed ? null : `${fig.querySelector(".docs-swatch__name").textContent}: painted ${painted}, printed ${printed}`;
      })
      .filter(Boolean),
  );

  expect(drift).toEqual([]);
});

test("text blocks share one edge, and non-text may run wider", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");

  /* `ch` is the advance of "0" in the ELEMENT's own font, so a measure in ch
     gave a different width to every font on the page — 586.5px of prose against
     538.4px of code, a 48px ragged edge nobody chose. In rem every text block
     gets the same number without the container having to force it. */
  const box = (sel) =>
    page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    }, sel);

  /* One prose column, so every text block in a section shares both edges.

     A <pre> and not the faces list, which is what this used to check. The bug
     being guarded is a measure that changes with the ELEMENT'S OWN FONT — 586.5
     of prose against 538.4 of code, from a measure written in ch — so the block
     worth measuring is the one set in a different face. The faces list was body
     text and could never have caught it; a code block is the exact case. */
  const prose = await box("#foundations p");
  /* The structure sample. It is the page's only <pre> now that the rhythm
     diagram has gone, and it sits in a different section from the paragraph it
     is measured against — which is the point: one prose column, one edge, all
     the way down. */
  const code = await box("#structure pre");

  expect(code.left, "a code block must share its paragraph's edge").toBe(prose.left);
  expect(code.right, "a code block must share its paragraph's edge").toBe(prose.right);

  /* The foundation tables start on the same vertical as the prose and stop
     wherever their content does. They are sized to content on purpose — the
     scale table's last column is an 80px bar, and stretching it to the measure
     left a 400px lane holding a 40px mark — so the right edge is deliberately
     NOT shared. What must still hold is that no table runs past the measure. */
  /* docs- prefixed, because the bare names belong to the headings. A table
     called #grouping squatted on the slug of the "Grouping" heading above it,
     which is what pushed that heading's anchor to #grouping-2. */
  for (const sel of ["#docs-faces", "#docs-scale", "#docs-grouping"]) {
    const table = await box(sel);
    expect(table.left, `${sel} must start on the prose edge`).toBe(prose.left);
    expect(table.right, `${sel} must not run past the measure`).toBeLessThanOrEqual(prose.right);
  }

  /* Anything that is not text takes the region it needs, so a swatch grid is
     never squeezed into a reading measure. Greater-or-equal rather than
     strictly greater, because whether prose is NARROWER than the region depends
     on the measure — and now that the measure IS the content area, it is not.
     The invariant that holds either way is that non-text is never narrower. */
  const grid = await box("#swatches");

  expect(grid.left).toBe(prose.left);
  expect(grid.width).toBeGreaterThanOrEqual(prose.width);

  /* Report whether --measure is still doing anything here. When prose fills the
     region, the token has stopped being a constraint and is only a ceiling that
     never gets reached — worth seeing in the run rather than discovering later. */
  const constrains = prose.width < grid.width;
  console.log(
    `  [measure] prose ${prose.width} in a ${grid.width} region — ` +
      (constrains ? "constraining" : "NOT constraining, prose fills the region"),
  );
});

test("a section title is an h1, and only the banner takes the display size", async ({ page }) => {
  await page.goto("/index.html");

  const type = await page.evaluate(() => {
    const px = (el) => parseFloat(getComputedStyle(el).fontSize);
    return {
      banner: px(document.querySelector("header.prose h1")),
      section: px(document.querySelector("#foundations > h1")),
      sub: px(document.querySelector("#foundations h2")),
      h1Count: document.querySelectorAll("main h1").length,
      /* Levels must not skip. Nothing infers depth from nesting — the HTML
         outline algorithm was never implemented and has been removed — so a
         jump from h1 to h3 is a real hole in the document, not a style choice. */
      levels: [...document.querySelectorAll("main :is(h1,h2,h3,h4,h5,h6)")].map((h) =>
        Number(h.tagName[1]),
      ),
    };
  });

  /* Separate sections are siblings, so they take h1 too. */
  expect(type.h1Count).toBeGreaterThan(1);

  /* The ladder has to carry the hierarchy on its own. */
  expect(type.banner).toBeGreaterThan(type.section);
  expect(type.section).toBeGreaterThan(type.sub);

  for (let i = 1; i < type.levels.length; i++) {
    expect(
      type.levels[i] - type.levels[i - 1],
      `heading level jumped from h${type.levels[i - 1]} to h${type.levels[i]}`,
    ).toBeLessThanOrEqual(1);
  }
});

test("the columns primitive still pairs subsections when given the room", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/index.html");

  /* The docs page no longer uses .columns — its prose is one column now — but
     the primitive stays in the system and stays tested. An untested primitive
     rots the moment the page that exercised it stops.

     The host is sized to exactly two measures plus one gutter, and it is
     written as calc() over the tokens rather than as the pixel count it comes
     to. It was hardcoded 1600, which was 768 + 64 + 768 and correct only while
     --gap-section was four units; the moment it dropped to two, auto-fill still
     fitted two tracks but had 32px spare, 1fr shared it out, and every track
     came out 784 against a 768 measure. The test was measuring its own stale
     arithmetic. Derived, the fit is exact whatever the tokens say.

     The page frame stops at 1216, so this form is only reachable in a container
     that is not the page frame. */
  const cols = await page.evaluate(() => {
    /* A fresh element rather than a clone of the page's own grid. Cloning drags
       along whatever the page happens to be doing to that node, and the point
       here is the primitive: give .columns a container wide enough for two
       measures and check what it does. */
    const host = document.createElement("div");
    host.className = "columns";
    host.style.cssText =
      "position:absolute;visibility:hidden;inline-size:calc(2 * var(--measure) + var(--gap-section))";
    host.innerHTML = "<div class='prose'><h2>a</h2><p>a</p></div>".repeat(4);
    document.body.append(host);
    const grid = host;
    const cs = getComputedStyle(grid);
    const tracks = cs.gridTemplateColumns.split(" ").map(parseFloat);

    /* Group the children by their top edge to recover the rows. */
    const rows = new Map();
    for (const el of grid.children) {
      const r = el.getBoundingClientRect();
      const key = Math.round(r.top);
      rows.set(key, [...(rows.get(key) ?? []), Math.round(r.width)]);
    }

    const probe = document.createElement("div");
    document.body.append(probe);
    probe.style.width = "var(--measure)";
    const measure = parseFloat(getComputedStyle(probe).width);
    probe.style.width = "var(--gap-section)";
    const section = parseFloat(getComputedStyle(probe).width);
    probe.remove();

    /* Read the gap BEFORE detaching. getComputedStyle returns a LIVE object, so
       reading cs.columnGap in the return statement — after host.remove() —
       resolved it against a detached element and produced NaN. The tracks read
       fine only because they were pulled out while the node was still in the
       document. */
    const gap = parseFloat(cs.columnGap);

    const width = Math.round(grid.getBoundingClientRect().width);

    host.remove();
    return { tracks, gap, rows: [...rows.values()], measure, section, width };
  });

  /* A FIXED track, not a 1fr share. 1fr would stretch each column to half the
     tier and put prose past its measure, which is the one thing the measure
     exists to prevent. */
  expect(cols.tracks.length).toBeGreaterThan(1);
  for (const t of cols.tracks) {
    expect(t, "a prose track must be exactly one measure").toBe(cols.measure);
  }

  /* The gutter between two prose columns is a section gap — the same value the
     rows already use, because the relationship is the same either way round. */
  expect(cols.gap).toBe(cols.section);

  /* The host really is the two-measure width it claims to be. Without this the
     calc() above could resolve to anything and the track assertions would still
     pass on a one-column grid. */
  expect(cols.width, "the host is not two measures plus a gutter").toBe(cols.measure * 2 + cols.gap);

  /* At least one row genuinely carries two subsections, or the whole feature
     is inert and this test is watching nothing. */
  expect(cols.rows.some((r) => r.length > 1), "no row shares two subsections").toBe(true);

  /* Every block is either one measure or a full span; nothing in between. */
  const full = cols.measure * 2 + cols.gap;
  for (const row of cols.rows) {
    for (const w of row) {
      expect([cols.measure, full], `a block ${w}px wide is neither a measure nor a full span`).toContain(w);
    }
  }
});

test("the superbar and the content share both edges", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 700 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  /* The bar sits outside the scroll region, so nothing aligns them by itself:
     the region loses a scrollbar's width and the bar does not, leaving the two
     centred frames offset by half a scrollbar. A short viewport is used on
     purpose, so the region definitely scrolls and the gutter is real. */
  const edges = await page.evaluate(() => {
    const box = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right) };
    };
    return {
      bar: box(".docs-bar .frame"),
      content: box(".docs-shell"),
      reserved: getComputedStyle(document.documentElement).getPropertyValue("--scrollbar-width"),
    };
  });

  expect(edges.bar.left, "left edges must agree").toBe(edges.content.left);
  expect(edges.bar.right, "right edges must agree").toBe(edges.content.right);

  /* And the measurement actually ran — a missing value would leave the fallback
     of 0px, which happens to be correct on overlay-scrollbar platforms and
     would hide a broken measurement everywhere else. */
  expect(edges.reserved, "docs.js must publish a scrollbar width").not.toBe("");
});

/*
 * A short page must still reach the bottom of the region it sits in. Both arms
 * of the condition are tested, because either one alone is trivial to satisfy
 * and wrong on its own: pinning the footer with a fixed height clips a long
 * page, and letting the page size itself leaves a short one hanging.
 *
 * Measured before the fix, at 1600 x 900 with the sections removed: the footer
 * ended 584px above the bottom of the region, with bare page under it.
 */
/* 1400 tall, and it has to be. This was 900, and 900 stopped being a window a
   stripped page is short in the moment the footer became a real one: four
   columns of links folded to one at 700 wide put the shell at 1030 against an
   858 region in Firefox, which has no text-box-trim and so runs taller than the
   other two engines at every block. The test then failed on a page that was not
   short — which is not the condition it exists to check.

   Raising the window is the honest fix. Stripping the footer as well as the
   sections would have kept 900 working and quietly stopped testing the page
   that ships. */
for (const { name, width } of [
  { name: "wide, with both rails", width: 1600 },
  { name: "narrow, with the rails stacked", width: 700 },
]) {
  test(`a short page fills the region — ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1400 });
    await page.goto("/index.html");
    await page.waitForLoadState("networkidle");

    const filled = await page.evaluate(() => {
      /* Cut the page down to a banner and a colophon. The contents list has to
         go with the sections it points at — docs.js builds it at load, so a
         list still naming five removed sections is itself enough content to
         make the region scroll, and the test would pass on the wrong ground. */
      document.querySelectorAll("main > section").forEach((s) => s.remove());
      document.querySelector("#docs-toc").replaceChildren();

      const region = document.querySelector(".docs-scroll");
      const shell = document.querySelector(".docs-shell");
      const column = document.querySelector(".docs-column");
      const footer = document.querySelector(".docs-scroll > footer");
      return {
        /* The desk plus the footer, because the two now share the region as
           siblings. It was the shell alone against the region, which was the
           right sum only while the footer was inside the shell. */
        shellHeight: Math.round(
          shell.getBoundingClientRect().height + footer.getBoundingClientRect().height,
        ),
        /* The region's CONTENT box, not its border box. The bar overlays the
           region now and the region reserves the bar's height as padding, so
           its outer box is a whole superbar taller than the space its children
           actually have to fill. Measured against the outer box this asserted
           that the desk should be 42px taller than the room it is given. */
        regionHeight: Math.round(
          region.clientHeight - parseFloat(getComputedStyle(region).paddingBlockStart),
        ),
        underFooter: Math.round(
          region.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom,
        ),
        /* The slack must land on the text and not on the two lists, which is
           the fault the row ladder exists to prevent. Stated against the RAILS,
           because they are the things that must not grow — it used to be stated
           against the footer's height, which worked only while the footer was a
           single line of colophon and broke the moment it became a real footer
           with four columns in it. A proxy that a content change can flip was
           never measuring the invariant. */
        columnBeatsRails: [...document.querySelectorAll(".docs-rail__inner")].every(
          (rail) =>
            Math.round(column.getBoundingClientRect().height) >
            Math.round(rail.getBoundingClientRect().height),
        ),
      };
    });

    expect(filled.shellHeight, "the desk and footer must fill the scroll region").toBe(filled.regionHeight);

    /* Measured against the SHELL now, and that is the change the footer's move
       bought. It used to be measured against its own column, because the footer
       lived inside the middle one and the column's bottom was the only edge it
       could be expected to reach; stacked, the local rail followed it in source
       order and left it legitimately above the region's bottom. Spanning every
       column and last in source order, it reaches the foot of the shell at both
       sizes, and the weaker per-column assertion is no longer needed. */
    expect(filled.underFooter, "the footer must sit at the foot of the region").toBe(0);
    expect(filled.columnBeatsRails, "the slack went to a rail, not to the text").toBe(true);
  });
}

test("a long page still scrolls rather than being clipped", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  /* min-block-size and never block-size. The whole page is inside a region of a
     fixed height, so a ceiling here would not overflow visibly — it would cut
     the document off and look deliberate. */
  const scrolled = await page.evaluate(() => {
    const region = document.querySelector(".docs-scroll");
    const footer = document.querySelector(".docs-scroll > footer");
    const column = document.querySelector(".docs-column");
    return {
      content: region.scrollHeight,
      visible: region.clientHeight,
      /* The footer follows the desk immediately once there is no slack — it
         does not keep a reserved band at the bottom of the window. Measured
         against the COLUMN rather than against <main>: the footer is no longer
         inside the column, so the edge it now follows is the sheet's. */
      belowColumn: Math.round(
        footer.getBoundingClientRect().top - column.getBoundingClientRect().bottom,
      ),
    };
  });

  expect(scrolled.content).toBeGreaterThan(scrolled.visible);
  /* Eight, not zero: the desk is inset from the region on all four sides now,
     so the footer follows the shell rather than the sheet, and the shell keeps
     a gutter under its last row. */
  expect(scrolled.belowColumn).toBe(8);
});

test("the rails let go when the footer needs the room", async ({ page }) => {
  /* The reason the footer is a SIBLING of the shell rather than a row inside
     it, asserted so nobody moves it back.

     A sticky element is clamped by its containing block, and for a grid item
     that ought to be its grid area. It is not: measured in Chromium, Gecko and
     WebKit alike, a sticky grid item roams the whole grid CONTAINER and ignores
     the area's edge. A footer given its own row inside .docs-shell therefore
     slid underneath two rails that stayed pinned to the top of the window —
     which looks almost right, and is the exact opposite of what a footer is
     for. Outside the shell, the shell's box ends where the footer starts, and
     clamping against a grid container's own box works everywhere.

     The window has to be SHORT for this to be visible, and that is not a rigged
     test — it is the condition itself. A rail only has to move when the footer
     would otherwise cover it; at 900px tall there is still most of a screen of
     desk beside the rails at the bottom of the page, and a rail that moved then
     would be leaving early. 500 is a window where the sum genuinely does not
     fit. */
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  const out = await page.evaluate(() => {
    const region = document.querySelector(".docs-scroll");
    const rail = document.querySelector(".docs-local .docs-rail__inner");
    const footer = document.querySelector(".docs-scroll > footer");

    region.scrollTop = 0;
    const pinnedTop = rail.getBoundingClientRect().top;

    /* Halfway: the rail must still be pinned, or "it moved" would prove nothing
       — an unstuck rail scrolls with the page and also ends up higher. */
    region.scrollTop = Math.round((region.scrollHeight - region.clientHeight) / 2);
    const midTop = rail.getBoundingClientRect().top;

    region.scrollTop = region.scrollHeight;
    return {
      pinnedTop,
      midTop,
      endTop: rail.getBoundingClientRect().top,
      railBottomAtEnd: rail.getBoundingClientRect().bottom,
      footerTopAtEnd: footer.getBoundingClientRect().top,
    };
  });

  expect(out.midTop, "the rail must stay pinned while the document lasts").toBe(out.pinnedTop);
  expect(out.endTop, "the rail must ride up as the footer arrives").toBeLessThan(out.pinnedTop);

  /* And it goes exactly as far as it has to: the rail ends where the footer
     begins and no further. This is the assertion that would catch a rail hidden
     with a scroll listener instead of released by the layout. */
  /* The rail stops one gutter short of the footer, not flush against it: the
     desk carries 8px of page below its last row, the same 8 it carries above
     and beside. Flush would mean the gutter had been lost on that edge. */
  expect(
    Math.round(out.footerTopAtEnd - out.railBottomAtEnd),
    'the rail must stop one gutter short of the footer',
  ).toBe(8);
});

test("the structure sample is real markup, not a sketch", async ({ page }) => {
  await page.goto("/index.html");

  /* A code sample in a design system is a specification: somebody will copy it.
     So it has to survive the parser, which the earlier shorthand version could
     not have — it had no closing tags at all, and the tree it implied was one
     the browser would never build. Parse the printed text and check the shape
     that comes back is the shape that was written. */
  const parsed = await page.evaluate(() => {
    const source = document.querySelector("#structure pre code").textContent;
    const doc = new DOMParser().parseFromString(source, "text/html");
    const root = doc.body.firstElementChild;

    const shape = (el) =>
      [...el.children].map((c) => ({ tag: c.tagName, children: shape(c) }));

    return {
      source,
      rootTag: root?.tagName,
      rootClass: root?.className,
      /* Nothing left over. A parser that had to restructure would leave the
         remainder as extra siblings of the root. */
      strayTopLevel: doc.body.children.length,
      figureInsideParagraph: !!root?.querySelector("p figure"),
      emptyParagraphs: [...(root?.querySelectorAll("p") ?? [])].filter(
        (p) => !p.textContent.trim(),
      ).length,
      order: [...(root?.children ?? [])].map((c) => c.tagName),
      articleOrder: [...(root?.querySelector("article")?.children ?? [])].map((c) => c.tagName),
      shape: shape(root ?? doc.body),
    };
  });

  /* Every element the sample opens, it closes. An unclosed tag shows up as a
     tag count that does not match. */
  const opens = [...parsed.source.matchAll(/<([a-z][\w-]*)(?=[\s>])/g)].map((m) => m[1]);
  const closes = [...parsed.source.matchAll(/<\/([a-z][\w-]*)>/g)].map((m) => m[1]);
  const VOID = new Set(["img", "br", "hr", "input", "meta", "link"]);
  const needClosing = opens.filter((t) => !VOID.has(t)).sort();

  expect(needClosing, "every non-void element must be closed").toEqual(closes.sort());

  /* And the tree it produces is the one the system documents. */
  expect(parsed.rootTag).toBe("DIV");
  expect(parsed.rootClass).toBe("document");
  expect(parsed.strayTopLevel, "the parser had to move something").toBe(1);
  expect(parsed.order).toEqual(["NAV", "ARTICLE"]);
  expect(parsed.articleOrder).toEqual(["HEADER", "SECTION", "FOOTER"]);

  /* The defect the structure review turned up, guarded in the sample too. */
  expect(parsed.figureInsideParagraph).toBe(false);
  expect(parsed.emptyParagraphs).toBe(0);
});

test("a step width is an absolute ceiling on the whole box", async ({ page }) => {
  /* A ceiling that excludes its own margins and padding is not a ceiling. 1280
     has to mean 1280 of everything, which is why the frame carries no padding
     at all: the gutter appears only when the viewport is narrower than the step
     and the frame goes fluid.

     The three steps are content (768), content + one rail (992, at XGA) and
     content + both rails and the sheet margin (1280). Below the first it is FLUID
     down — 700px of viewport gives 660 of frame, not a smaller fixed step. That
     is the change from the old fixed grid and the case worth guarding. */
  const STEPS = [
    { viewport: 2560, ceiling: 1280 },
    { viewport: 1400, ceiling: 1280 },
    { viewport: 1050, ceiling: 992 },
    { viewport: 900, ceiling: 768 },
    { viewport: 700, ceiling: 768 },
  ];

  for (const { viewport, ceiling } of STEPS) {
    await page.setViewportSize({ width: viewport, height: 900 });
    await page.goto("/index.html");

    const box = await page.evaluate(() => {
      const el = document.querySelector(".docs-shell");
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        outer: Math.round(r.width),
        padding: parseFloat(cs.paddingInlineStart) + parseFloat(cs.paddingInlineEnd),
        /* The frame's 100% is this, NOT the viewport. The docs page reserves a
           scrollbar here, and the reserved strip is engine-specific — 15px on
           Chromium, more on Gecko, nothing at all where scrollbars overlay. An
           expectation written against the viewport would be asserting this
           machine's scrollbar. */
        region: document.querySelector(".docs-scroll").clientWidth,
      };
    });

    expect(box.outer, `frame at a ${viewport}px viewport`).toBeLessThanOrEqual(ceiling);

    /* No padding on the frame — a gutter taken from inside the ceiling would
       narrow the content below the width the whole system is built on. */
    expect(box.padding, "the frame must carry no padding").toBe(0);

    /* The rule, exactly: min(ceiling, what is available less two gutters). The
       step comes from the VIEWPORT, because the media query does; the fluid arm
       comes from the CONTAINER, because the percentage does. Those are two
       different widths whenever a scrollbar is reserved, and the frame has to be
       right in both arms. */
    expect(box.outer, `frame at ${viewport}px`).toBe(Math.min(ceiling, box.region - 32));
  }
});

test("the page never scrolls sideways", async ({ page }) => {
  for (const width of [320, 480, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/index.html");

    /* Measure the SCROLL REGION, not the document. Since the shell went in the
       document has overflow:hidden and cannot report sideways scroll at all —
       checking it would be a guard that can no longer fail, which looks exactly
       like a guard that passes. */
    const overflow = await page.evaluate(() => {
      const region = document.querySelector(".docs-scroll");
      return {
        region: region.scrollWidth - region.clientWidth,
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(overflow.region, `horizontal overflow in the scroll region at ${width}px`).toBeLessThanOrEqual(0);
    expect(overflow.doc, `horizontal overflow on the document at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("the skip link is the first focusable thing in the document", async ({ page, browserName }) => {
  await page.goto("/index.html");

  /* The structural invariant, which every engine agrees on: nothing focusable
     precedes the skip link in DOM order. Assert this rather than "Tab lands on
     it", because Tab reachability is a platform preference, not a property of
     the markup — see below. */
  const first = await page.evaluate(() => {
    const el = document.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    return { text: el.textContent.trim(), href: el.getAttribute("href") };
  });
  expect(first).toEqual({ text: "Skip to content", href: "#main" });

  /* Tab BEFORE touching focus. blur() clears document.activeElement but leaves
     the sequential focus navigation starting point where it was, so a Tab after
     a focus/blur pair moves to the element AFTER the one just blurred — not
     back to the top. Checking this first is the only way to observe a genuinely
     fresh document.

     Reported for WebKit, asserted elsewhere: Safari does not move Tab focus to
     links unless full keyboard access is on, which is a platform preference
     rather than anything the markup can fix. */
  await page.keyboard.press("Tab");
  const tabbed = await page.evaluate(() => document.activeElement?.getAttribute("href"));
  console.log(`  [${browserName}] Tab reaches the skip link: ${tabbed === "#main"}`);
  if (browserName !== "webkit") expect(tabbed).toBe("#main");

  /* And it must become visible once focused — a skip link that stays clipped
     while focused is worse than none, because it sends focus somewhere the
     reader cannot see. */
  await page.locator("a[href='#main']").focus();
  await expect(page.locator("a[href='#main']")).toBeVisible();
});

test("an anchor lands clear of the superbar, not underneath it", async ({ page }) => {
  /* The bar overlays the scroll region so it can frost what passes beneath it.
     The cost of that is that anything scrolled to at the region's top edge
     lands behind the bar, and a contents list whose links put the heading you
     asked for out of sight is worse than no contents list.

     The obvious remedy — scroll-padding-block-start on the region — computes
     correctly and does nothing here, because the region already carries a real
     padding of the bar's height and the scrollport is the padding box. This
     asserts the behaviour rather than the property, so it stays true whichever
     mechanism ends up doing the work. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  const barBottom = await page.evaluate(
    () => document.querySelector(".docs-bar").getBoundingClientRect().bottom,
  );
  expect(barBottom, "the bar must overlay the region for this to be a question").toBeGreaterThan(0);

  /* Every link in the local rail, not a sample: the ids are generated, and one
     that lands wrong is exactly the one nobody clicked while testing. */
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("#docs-toc a")].map((a) => a.getAttribute("href")),
  );
  expect(hrefs.length, "no contents links found").toBeGreaterThan(3);

  const landings = [];
  for (const href of hrefs) {
    const top = await page.evaluate(async (h) => {
      const region = document.querySelector(".docs-scroll");
      region.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 60));
      document.querySelector(`#docs-toc a[href="${h}"]`).click();
      await new Promise((r) => setTimeout(r, 400));
      const el = document.querySelector(h);
      /* At the very bottom of the document a target cannot come any higher, so
         a landing below the bar is the best the page can do and is not a fault. */
      const atEnd = region.scrollTop >= region.scrollHeight - region.clientHeight - 1;
      return atEnd ? null : Math.round(el.getBoundingClientRect().top);
    }, href);
    if (top !== null) landings.push({ href, top });
  }

  const covered = landings.filter((l) => l.top < barBottom);
  expect(covered, "these anchors landed underneath the superbar").toEqual([]);
});

test("the window itself can never scroll", async ({ page }) => {
  /* The shell's whole premise is that the WINDOW does not move: <body> is
     exactly one viewport tall and .docs-scroll is the only thing that scrolls.
     Nothing asserted it, and it stopped being true without a visible symptom.

     .visually-hidden is position: absolute — the skip link and every table's
     caption. With no positioned ancestor their containing block was the
     document, so body's overflow never clipped them and their static positions
     gave <html> a scroll range of 2559px against a 911px window. One pixel
     square and clipped to nothing, so the page looked perfect.

     What it cost showed up somewhere else entirely. Clicking a contents link
     near the end of the document let the browser satisfy the target's
     scroll-margin by scrolling the region to its limit and then taking the
     remainder out of the root: the document slid up and left a band of bare
     page under the footer that no amount of scrolling would clear.

     So this asserts the range, not the symptom. A root that cannot scroll has
     nowhere to put a shortfall, and every way of producing one is covered at
     once. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  const range = await page.evaluate(() => {
    const html = document.documentElement;
    return {
      scrollRange: html.scrollHeight - html.clientHeight,
      /* Named, because "something overflows" is not a useful failure. */
      escaping: [...document.querySelectorAll("body *")]
        .filter((el) => {
          if (getComputedStyle(el).position !== "absolute") return false;
          let p = el.parentElement;
          while (p && p !== document.documentElement) {
            const cs = getComputedStyle(p);
            if (cs.position !== "static" || cs.transform !== "none" || cs.filter !== "none") return false;
            p = p.parentElement;
          }
          return true;
        })
        .map((el) => el.tagName.toLowerCase() + (el.className ? `.${String(el.className).trim().split(/\s+/)[0]}` : "")),
    };
  });

  expect(
    [...new Set(range.escaping)],
    "these absolutely positioned elements have no positioned ancestor, so the document contains them",
  ).toEqual([]);
  expect(range.scrollRange, "the window has somewhere to scroll to").toBe(0);

  /* And it stays zero after the jump that used to break it. */
  await page.evaluate(async () => {
    document.querySelector('#docs-toc a[href="#principles"]').click();
    await new Promise((r) => setTimeout(r, 500));
  });

  const after = await page.evaluate(() => ({
    rootScroll: Math.round(document.scrollingElement.scrollTop),
    bodyTop: Math.round(document.body.getBoundingClientRect().top),
  }));

  expect(after.rootScroll, "a contents jump scrolled the window").toBe(0);
  expect(after.bodyTop, "the document was pushed off the top of the window").toBe(0);
});
