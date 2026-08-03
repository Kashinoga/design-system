import { test, expect } from "@playwright/test";

/*
 * What the browser computed, not what the file says.
 *
 * The source tests can only see text. This file exists because of a bug they
 * could not have caught: a stray comment marker made the CSS parser discard the
 * whole --font-body declaration, so the token was present in the file, spelled
 * correctly, and resolved to nothing. The page still rendered. Only a browser
 * knew.
 */

const SEMANTIC = [
  "--ink", "--sub", "--page", "--surface", "--hairline",
  "--accent", "--emerald", "--ruby", "--topaz",
  "--font-body", "--font-display", "--font-mono", "--font-numeral",
  "--text-xs", "--text-sm", "--text-base", "--text-lg", "--text-xl", "--text-2xl",
  "--leading-tight", "--leading-body", "--weight-normal", "--weight-strong",
  "--measure", "--gutter", "--frame-max",
  "--gap-tight", "--gap-within", "--gap-between", "--gap-section",
  "--radius-sheet", "--radius-key",
  "--focus-ring-width", "--focus-ring-offset", "--focus-ring-color",
  "--duration-fast", "--duration-base", "--ease-out", "--ease-spring",
  "--shadow-sheet",
];

const RUNGS = [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80];

const TIERS = ["--gap-tight", "--gap-within", "--gap-between", "--gap-section"];

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("every semantic token resolves to something", async ({ page }) => {
  const empty = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    return names.filter((n) => cs.getPropertyValue(n).trim() === "");
  }, SEMANTIC);

  expect(empty, "tokens present in the source but resolving to nothing").toEqual([]);
});

test("the type tokens are actually in use, not just declared", async ({ page }) => {
  /* The declaration resolving is necessary but not sufficient — it can resolve
     and still be dropped at the use site. Assert the used value on real
     elements, and specifically that nothing has fallen back to the browser
     default serif, which is what a discarded font-family looks like. */
  const used = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    heading: getComputedStyle(document.querySelector("h1")).fontFamily,
    prose: getComputedStyle(document.querySelector("main p")).fontFamily,
    code: getComputedStyle(document.querySelector("code")).fontFamily,
  }));

  for (const [where, family] of Object.entries(used)) {
    expect(family, `${where} fell back to the browser default`).not.toMatch(/^["']?Times|^serif$/i);
  }

  /* Type lives on :root so the root-relative font units (rch, rex, rcap, ric,
     rlh) measure against the real face. This regressed once, invisibly. */
  expect(used.root).toBe(used.prose);
  expect(used.code).not.toBe(used.prose);
});

test("no token reaches the page as an unresolved var()", async ({ page }) => {
  const leaked = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      for (const prop of ["color", "backgroundColor", "fontFamily", "maxInlineSize"]) {
        if (String(cs[prop]).includes("var(")) out.push(`${el.tagName}.${prop}`);
      }
    }
    return out;
  });

  expect(leaked).toEqual([]);
});

/* The spec is explicit that the extremes are the useless part of a sweep: at
   either end every clamp() is pinned, so a bounds-only check passes on values
   that are fractional everywhere between. These widths are chosen to sit in the
   middle. Nothing in the scale is fluid yet — this is the harness waiting for
   the first clamp() rather than a test looking for a bug that exists today. */
for (const width of [320, 480, 768, 900, 1024, 1280, 1440]) {
  test(`the spacing scale stays whole at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    const measured = await page.evaluate((rungs) => {
      const probe = document.createElement("div");
      document.body.append(probe);
      const out = {};
      for (const n of rungs) {
        probe.style.width = `var(--space-${n})`;
        out[n] = parseFloat(getComputedStyle(probe).width);
      }
      probe.remove();
      return out;
    }, RUNGS);

    for (const n of RUNGS) {
      expect(measured[n], `--space-${n} at ${width}px viewport`).toBe(n);
    }
  });
}

test("the grouping tiers stay twice-apart once the browser has resolved them", async ({ page }) => {
  /* The source test checks the alias chain in the file. This checks the pixels
     a browser actually computed — the ratio is the entire mechanism by which
     space replaces a border, so it is worth asserting on both sides. */
  const px = await page.evaluate((tiers) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const out = tiers.map((t) => {
      probe.style.width = `var(${t})`;
      return { tier: t, value: parseFloat(getComputedStyle(probe).width) };
    });
    probe.remove();
    return out;
  }, TIERS);

  for (let i = 1; i < px.length; i++) {
    expect(
      px[i].value,
      `${px[i].tier} must be at least twice ${px[i - 1].tier}`,
    ).toBeGreaterThanOrEqual(px[i - 1].value * 2);
  }
});

test("a document keeps the beat: one unit everywhere, two before a new H1", async ({ page }) => {
  /* The source test checks that the two tokens are 2:1. This builds the exact
     document from the model and measures what a browser put on the screen,
     which is the only place the :is() specificity trick can be proved to work —
     get that wrong and an H1 after a heading silently takes the doubled gap. */
  const gaps = await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "prose";
    host.style.cssText = "position:absolute;visibility:hidden;inline-size:40rem";
    host.innerHTML = `<h1>a</h1><p>b</p><p>c</p><h1>d</h1><h2>e</h2><p>f</p>`;
    document.body.append(host);

    const kids = [...host.children];
    const out = kids.slice(1).map((el, i) => {
      const above = kids[i].getBoundingClientRect();
      return {
        pair: `${kids[i].tagName} -> ${el.tagName}`,
        gap: Math.round(el.getBoundingClientRect().top - above.bottom),
      };
    });

    const unit = parseFloat(getComputedStyle(host).getPropertyValue("--prose-gap")) ;
    host.remove();
    return { out, unit };
  });

  /* The pattern straight from the model: H1>P, P>P, P>H1 (doubled), H1>H2
     (a heading under a heading stays close), H2>P. */
  const pattern = gaps.out.map((g) => g.gap);
  const [one] = pattern;

  expect(pattern, `measured ${JSON.stringify(gaps.out)}`).toEqual([one, one, one * 2, one, one]);
  expect(one).toBeGreaterThan(0);
});

test("nothing in the system layers draws a line", async ({ page }) => {
  /* The source test greps for border declarations. This one asks the browser
     what actually got painted, which catches a line arriving from anywhere —
     a shorthand, a UA default the reset failed to clear, an inherited edge. */
  const lined = await page.evaluate(() => {
    const SIDES = ["Top", "Right", "Bottom", "Left"];
    /* No allowlist. The last border on the page — around the colour swatches —
       went when the card behind them was tinted instead. Nothing is exempt. */
    return [...document.querySelectorAll("main *, footer *")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        return SIDES.some((s) => parseFloat(cs[`border${s}Width`]) > 0);
      })
      .map((el) => `${el.tagName.toLowerCase()}${el.className ? "." + el.className : ""}`);
  });

  expect([...new Set(lined)]).toEqual([]);
});

test("light-dark() actually switches, in both directions", async ({ page }) => {
  const read = () =>
    page.evaluate(() => ({
      page: getComputedStyle(document.body).backgroundColor,
      ink: getComputedStyle(document.body).color,
    }));

  await page.emulateMedia({ colorScheme: "light" });
  const light = await read();

  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await read();

  expect(light.page).not.toBe(dark.page);
  expect(light.ink).not.toBe(dark.ink);

  /* A mix toward --ink moves in opposite directions on the two stocks, so the
     useful assertion is the relationship, not the numbers: the page is darker
     than its ink on dark stock and lighter than it on light stock. */
  const luma = (rgb) => {
    const [r, g, b] = rgb.match(/[\d.]+/g).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  expect(luma(light.page)).toBeGreaterThan(luma(light.ink));
  expect(luma(dark.page)).toBeLessThan(luma(dark.ink));
});
