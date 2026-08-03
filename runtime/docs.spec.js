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

  /* Compare blocks INSIDE one subsection. Since subsections flow into columns,
     two blocks in different columns are meant to have different edges — the
     claim is about a block and its neighbours, not about the whole page. */
  const prose = await box("#faces ~ p, #foundations .prose:has(#faces) p");
  const defs = await box("#faces");

  expect(defs.left, "a definition list must share its paragraph's edge").toBe(prose.left);
  expect(defs.right, "a definition list must share its paragraph's edge").toBe(prose.right);

  /* And a block that carries something wider than prose spans the row instead,
     so a five-column swatch grid is not squeezed into a reading measure. */
  const swatchProse = await box("#foundations .prose:has(#swatches) p");
  const grid = await box("#swatches");

  expect(grid.left).toBe(swatchProse.left);
  expect(grid.width).toBeGreaterThan(prose.width);
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

test("prose subsections share a row, at the measure, on the grid", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/index.html");

  const cols = await page.evaluate(() => {
    const grid = document.querySelector("#foundations .columns");
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
    probe.style.width = "var(--column)";
    const column = parseFloat(getComputedStyle(probe).width);
    probe.remove();

    return { tracks, gap: parseFloat(cs.columnGap), rows: [...rows.values()], measure, column };
  });

  /* A FIXED track, not a 1fr share. 1fr would stretch each column to half the
     tier and put prose past its measure, which is the one thing the measure
     exists to prevent. */
  expect(cols.tracks.length).toBeGreaterThan(1);
  for (const t of cols.tracks) {
    expect(t, "a prose track must be exactly one measure").toBe(cols.measure);
  }

  /* The gutter is three grid columns, so two measures plus it is 25 columns —
     the reading layout exactly. */
  expect(cols.gap).toBe(cols.column * 3);
  expect(cols.measure * 2 + cols.gap).toBe(cols.column * 25);

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
      content: box("main.frame"),
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

test("a tier width is an absolute ceiling on the whole box", async ({ page }) => {
  /* A ceiling that excludes its own margins and padding is not a ceiling. 1200
     has to mean 1200 of everything, which is why the frame carries no padding
     at all: the gutter appears only when the viewport is narrower than the tier
     and the frame goes fluid. */
  const TIERS = [
    { viewport: 2560, ceiling: 1440 },
    { viewport: 1440, ceiling: 1200 },
    { viewport: 1000, ceiling: 1200 },
    { viewport: 700, ceiling: 864 },
  ];

  for (const { viewport, ceiling } of TIERS) {
    await page.setViewportSize({ width: viewport, height: 900 });
    await page.goto("/index.html");

    const box = await page.evaluate(() => {
      const el = document.querySelector("main.frame");
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        outer: Math.round(r.width),
        padding: parseFloat(cs.paddingInlineStart) + parseFloat(cs.paddingInlineEnd),
      };
    });

    expect(box.outer, `frame at a ${viewport}px viewport`).toBeLessThanOrEqual(ceiling);

    /* No padding on the frame — a gutter inside the ceiling would eat the
       columns and put 24.2 of them in a 25-column tier. */
    expect(box.padding, "the frame must carry no padding").toBe(0);

    /* And at the tier, the box is exactly the tier: a whole number of columns
       with nothing shaved off. */
    if (viewport >= ceiling + 40) {
      expect(box.outer, `frame should fill its tier at ${viewport}px`).toBe(ceiling);
      expect(box.outer % 48, "the frame must be a whole number of columns").toBe(0);
    }
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
