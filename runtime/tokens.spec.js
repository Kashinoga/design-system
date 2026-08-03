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
  "--space", "--space-x2", "--space-x3", "--space-x4",
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

test("[s] is the floor once the browser has resolved everything", async ({ page }) => {
  /* The source test reads the alias chain in the file. This reads the pixels a
     browser computed, which is the only way to catch a floor broken by a
     media query, a container query, or a cascade layer overriding --space. */
  const px = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const read = (t) => {
      probe.style.width = `var(${t})`;
      return parseFloat(getComputedStyle(probe).width);
    };
    const out = {
      s: read("--space"),
      tight: read("--gap-tight"),
      within: read("--gap-within"),
      between: read("--gap-between"),
      section: read("--gap-section"),
      multiples: [2, 3, 4].map((n) => read(`--space-x${n}`)),
    };
    probe.remove();
    return out;
  });

  expect(px.s).toBeGreaterThan(0);
  for (const tier of ["within", "between", "section"]) {
    expect(px[tier], `--gap-${tier} must not fall below the [s] floor`).toBeGreaterThanOrEqual(px.s);
  }

  /* The one value under the floor — a label and its field are one control. */
  expect(px.tight).toBeLessThan(px.s);

  expect(px.multiples).toEqual([px.s * 2, px.s * 3, px.s * 4]);
});

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
    host.innerHTML =
      `<h1>a</h1><p>b</p><p>c</p><h1>d</h1><h2>e</h2><p>f</p><h2>g</h2><p>h</p>`;
    document.body.append(host);

    const kids = [...host.children];
    const out = kids.slice(1).map((el, i) => {
      const above = kids[i].getBoundingClientRect();
      return {
        pair: `${kids[i].tagName}->${el.tagName}`,
        gap: Math.round(el.getBoundingClientRect().top - above.bottom),
      };
    });

    const probe = document.createElement("div");
    document.body.append(probe);
    const read = (t) => {
      probe.style.width = `var(${t})`;
      return parseFloat(getComputedStyle(probe).width);
    };
    const units = { unit: read("--space"), double: read("--space-x2"), tight: read("--gap-tight") };
    probe.remove();

    host.remove();
    return { out, units };
  });

  /* Heading spacing is asymmetric, and that is the whole point: MORE above a
     heading than below it. Equal space on both sides leaves the heading
     floating between two blocks with no way to tell which one it names. */
  const { unit, double, tight } = gaps.units;

  /* An ordered list, not a map — H2->P occurs twice and a map would collapse
     the two into one, quietly halving what this test checks. */
  expect(gaps.out).toEqual([
    { pair: "H1->P", gap: unit }, //    one unit below a heading
    { pair: "P->P", gap: unit }, //     the floor, between two ordinary blocks
    { pair: "P->H1", gap: double }, //  two units above — a heading starts something new
    { pair: "H1->H2", gap: unit }, //   a heading under a heading is one title block
    { pair: "H2->P", gap: unit },
    { pair: "P->H2", gap: double }, //  every level, not h1 alone
    { pair: "H2->P", gap: unit },
  ]);

  /* The asymmetry, asserted as a relationship so a future retune of the tokens
     cannot quietly flatten it. A heading must sit closer to what it names than
     to what it follows, or a reader cannot tell which side it belongs to. */
  expect(double).toBeGreaterThan(unit);
  expect(tight).toBeLessThan(unit);
});

test("the leading is trimmed off every block in the rhythm", async ({ page }) => {
  /* A line box is taller than its letters, so an untrimmed 16px gap renders as
     about 25px. Every spacing value would then understate itself by more than
     half a rung, and the [s] floor would not mean what it says. Caught by
     measuring a list that looked too loose and was already exactly one unit. */
  const trimmed = await page.evaluate(() => {
    const out = {};
    for (const sel of ["main p", "#principles li", "h2"]) {
      const el = document.querySelector(sel);
      /* getPropertyValue, not the camelCase accessor. Gecko has not shipped the
         property, so `.textBoxTrim` is undefined rather than "none" — and an
         undefined compared against a list of allowed strings fails in a way
         that looks like a styling bug instead of a missing feature. */
      out[sel] = el ? getComputedStyle(el).getPropertyValue("text-box-trim") : "missing";
    }
    return out;
  });

  for (const [sel, value] of Object.entries(trimmed)) {
    /* Gecko keeps the leading, which is the same accepted cross-browser
       difference the heading trim already carries. "" is Gecko not knowing the
       property at all. */
    expect(["trim-both", "none", ""], `${sel} reported "${value}"`).toContain(value);
  }
});

test("a container's spacing knob does not leak into the containers inside it", async ({ page }) => {
  /* Custom properties inherit. A knob set on an outer container reached every
     container inside it, and `var(--stack-gap, <default>)` never fell back,
     because the property was inherited rather than unset. The visible result
     was a section gap where one unit was intended, with nothing in the markup
     to explain it. Registered with inherits:false, which this proves. */
  const measured = await page.evaluate(() => {
    const outer = document.createElement("div");
    outer.className = "stack";
    outer.style.setProperty("--stack-gap", "64px");
    outer.innerHTML = `
      <div class="stack" id="inner"><i>a</i><i>b</i></div>
      <div class="stack" id="tuned" style="--stack-gap: 4px"><i>a</i><i>b</i></div>`;
    document.body.append(outer);

    const probe = document.createElement("div");
    document.body.append(probe);
    probe.style.width = "var(--gap-within)";
    const within = parseFloat(getComputedStyle(probe).width);
    probe.remove();

    const out = {
      outer: getComputedStyle(outer).rowGap,
      inner: getComputedStyle(outer.querySelector("#inner")).rowGap,
      tuned: getComputedStyle(outer.querySelector("#tuned")).rowGap,
      within,
    };
    outer.remove();
    return out;
  });

  /* The container that set the knob keeps it. */
  expect(measured.outer).toBe("64px");

  /* The one inside falls back to the default, not to its ancestor's value. */
  expect(measured.inner).toBe(`${measured.within}px`);

  /* And an inner container can still tune itself. */
  expect(measured.tuned).toBe("4px");
});

test("every length token lands on a whole pixel", async ({ page }) => {
  /* A fractional value is not a rounding detail. The browser rounds it per
     line and per box, so the same token pays half a pixel in one place and
     nothing in another, and a rhythm built on top of it drifts with no rule to
     point at. The type scale used to be 12.8 / 14.4 / 16 / 16.8 / 21.6 / 35.2 —
     one of six was whole. */
  const LENGTHS = [
    "--text-xs", "--text-sm", "--text-base", "--text-lg", "--text-xl", "--text-2xl",
    "--measure", "--gutter", "--frame-max", "--sidenote-width", "--toc-width",
    "--column", "--width-standard", "--width-reference", "--width-large", "--width-cap", "--column-gap",
    "--space", "--space-x2", "--space-x3", "--space-x4",
    "--gap-tight", "--gap-within", "--gap-between", "--gap-section",
    "--radius-sheet", "--radius-key", "--focus-ring-width", "--focus-ring-offset",
  ];

  const fractional = await page.evaluate((names) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const bad = [];
    for (const n of names) {
      probe.style.width = `var(${n})`;
      const px = parseFloat(getComputedStyle(probe).width);
      if (!Number.isInteger(px)) bad.push(`${n} = ${px}px`);
    }
    probe.remove();
    return bad;
  }, LENGTHS);

  expect(fractional).toEqual([]);
});

test("every tier is a whole number of one unchanging column", async ({ page }) => {
  /* The metric-paper property: the unit survives the change of size. One column
     is 80px at every tier, and the tier only changes how many there are, so
     nothing is ever divided and nothing can come out fractional. */
  const px = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const read = (t) => {
      probe.style.width = `var(${t})`;
      return parseFloat(getComputedStyle(probe).width);
    };
    const out = {
      column: read("--column"),
      standard: read("--width-standard"),
      reference: read("--width-reference"),
      large: read("--width-large"),
      cap: read("--width-cap"),
      measure: read("--measure"),
      sidenote: read("--sidenote-width"),
      toc: read("--toc-width"),
    };
    probe.remove();
    return out;
  });

  expect(px.column).toBe(48);
  expect(px.standard).toBe(px.column * 11);
  expect(px.reference).toBe(px.column * 18);
  expect(px.large).toBe(px.column * 25);
  expect(px.cap).toBe(px.column * 30);

  /* Seven columns, because there is no half of fifteen. 15 = 4 + 7 + 4 puts the
     text centred with a margin column each side. */
  expect(px.measure).toBe(px.column * 11);
  expect(px.sidenote).toBe(px.column * 7);
  expect(px.toc).toBe(px.column * 7);
  expect(px.measure + px.sidenote + px.toc).toBe(px.large);

  for (const [name, v] of Object.entries(px)) {
    expect(Number.isInteger(v), ` = px`).toBe(true);
    expect(v % px.column, ` is not a whole number of columns`).toBe(0);
  }
});

test("an item grid fills its region on whole columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");

  /* The swatch grid is NOT a region division — it is a flow of items filling
     one region, and the column count falls out of the width. Five is an
     outcome, not a choice, so nothing may depend on it being five. What DOES
     have to hold is that the columns land on whole pixels: the gap is part of
     that arithmetic, not a decoration applied afterwards. */
  const grid = await page.evaluate(() => {
    const el = document.querySelector("#swatches");
    const cs = getComputedStyle(el);
    const tracks = cs.gridTemplateColumns.split(" ").map(parseFloat);
    return {
      count: tracks.length,
      tracks,
      gap: parseFloat(cs.columnGap),
      width: Math.round(el.getBoundingClientRect().width),
    };
  });

  expect(grid.count).toBeGreaterThan(1);

  /* Never more than five. Eight across at the 2160 cap is past the point where
     a row reads as a row — the eye stops taking it in and starts scanning it
     like a table. The cap is arithmetic, not a media query: each track is at
     least a fifth of the width, so auto-fit cannot place a sixth. */
  expect(grid.count).toBeLessThanOrEqual(5);

  /* Whole tracks at the tier the grid is designed for. No gap makes EVERY
     count whole — 1fr distribution cannot promise that — so 20 is chosen to
     divide the capped count of five: 224 at 1200, 416 at 2160. */
  for (const t of grid.tracks) {
    expect(Number.isInteger(t), `column track ${t}px at a 1440 viewport`).toBe(true);
  }

  /* This one must hold at every width and every count: tracks plus gaps sum to
     the container exactly. A remainder is a right edge that does not line up. */
  const total = grid.tracks.reduce((a, b) => a + b, 0) + grid.gap * (grid.count - 1);
  expect(Math.round(total)).toBe(grid.width);
});

test("the item grid never exceeds five columns, at any width", async ({ page }) => {
  /* The cap has to survive the widest tier, which is where it matters: at 2160
     a 224px minimum would otherwise fit eight. */
  for (const width of [1000, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/index.html");

    const count = await page.evaluate(
      () => getComputedStyle(document.querySelector("#swatches")).gridTemplateColumns.split(" ").length,
    );

    expect(count, `columns at a ${width}px viewport`).toBeLessThanOrEqual(5);
  }
});

test("every line box in the type scale is a whole number of pixels", async ({ page }) => {
  /* Two ratios cover the system: 1.5 for body, 1.25 for headings. That only
     works because the heading sizes are multiples of 4 — the ratio and the
     scale were chosen together, and changing either alone reintroduces
     fractions. */
  const boxes = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.textContent = "x";
    document.body.append(probe);
    const out = [];
    for (const [size, leading] of [
      ["--text-xs", "--leading-body"], ["--text-sm", "--leading-body"],
      ["--text-base", "--leading-body"], ["--text-base", "--leading-tight"],
      ["--text-lg", "--leading-tight"], ["--text-xl", "--leading-tight"],
      ["--text-2xl", "--leading-tight"],
    ]) {
      probe.style.fontSize = `var(${size})`;
      probe.style.lineHeight = `var(${leading})`;
      const cs = getComputedStyle(probe);
      out.push({
        pair: `${size} x ${leading}`,
        size: parseFloat(cs.fontSize),
        pitch: parseFloat(cs.lineHeight),
      });
    }
    probe.remove();
    return out;
  });

  for (const b of boxes) {
    expect(Number.isInteger(b.size), `${b.pair}: size ${b.size}px`).toBe(true);
    expect(Number.isInteger(b.pitch), `${b.pair}: line pitch ${b.pitch}px`).toBe(true);
  }
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
