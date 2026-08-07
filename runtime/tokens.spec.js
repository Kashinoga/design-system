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
  "--ink", "--sub", "--page", "--surface", "--recessed", "--hairline",
  "--accent", "--emerald", "--ruby", "--topaz",
  "--font-body", "--font-display", "--font-mono", "--font-numeral",
  "--text-xs", "--text-sm", "--text-base", "--text-lg", "--text-xl", "--text-2xl",
  "--leading-tight", "--leading-body", "--weight-normal", "--weight-strong",
  "--measure", "--rail", "--width-page", "--gutter", "--frame-max", "--gap-region",
  "--space", "--space-x2", "--space-x3", "--space-x4",
  "--gap-tight", "--gap-within", "--gap-between", "--gap-section",
  "--radius-sheet", "--radius-key",
  "--focus-ring-width", "--focus-ring-offset", "--focus-ring-color",
  "--duration-fast", "--duration-base", "--ease-out", "--ease-spring",
  "--shadow-sheet",
];

const RUNGS = [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80];

/* --gap-section left this ladder when it dropped from four units to two. It is
   a reason at --gap-between's value now, the same standing --gap-region has —
   see the note on the matching source test in test/tokens.test.js. */
const TIERS = ["--gap-tight", "--gap-within", "--gap-between"];

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

test("a document keeps the beat: two units between every pair of blocks", async ({ page }) => {
  /* The source test checks the rule is in the file. This builds the exact
     document from the model and measures what a browser put on the screen.

     The rhythm is flat: every block sits two units below the one before it,
     headings and consecutive paragraphs alike. That makes this test cheaper to
     state and MORE necessary, not less — a single stray override is invisible
     in the file and obvious here. Four rules have been removed from this rhythm
     over time, the last of them a p + p exception. This is what stops one of
     them growing back. */
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
    const units = { unit: read("--space"), double: read("--space-x2") };
    probe.remove();

    host.remove();
    return { out, units };
  });

  const { unit, double } = gaps.units;

  /* An ordered list, not a map — H2->P occurs twice and a map would collapse
     the two into one, quietly halving what this test checks.

     Every pair carries the same number on purpose; the pairs are spelled out
     anyway because the ones that used to differ are exactly the ones a
     regression would hit. A p + p exception was tried and reverted. */
  expect(gaps.out).toEqual([
    { pair: "H1->P", gap: double }, //  was one unit — a heading sat ON its content
    { pair: "P->P", gap: double },
    { pair: "P->H1", gap: double }, //  was four units
    { pair: "H1->H2", gap: double }, // was one unit — the title-block pair
    { pair: "H2->P", gap: double },
    { pair: "P->H2", gap: double }, //  was four units, at every level
    { pair: "H2->P", gap: double },
  ]);

  /* Stated as a relationship, not as 32, so a retune of [s] carries the rhythm
     with it instead of stranding a literal. */
  expect(double).toBe(unit * 2);
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
    "--rail", "--width-page", "--gap-region",
    "--space", "--space-x2", "--space-x3", "--space-x4",
    "--gap-tight", "--gap-within", "--gap-between", "--gap-section",
    "--radius-sheet", "--radius-key", "--focus-ring-width", "--focus-ring-offset",
  ];

  const measured = await page.evaluate((names) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const out = {};
    for (const n of names) {
      probe.style.width = `var(${n})`;
      out[n] = parseFloat(getComputedStyle(probe).width);
    }
    probe.remove();
    return out;
  }, LENGTHS);

  const fractional = Object.entries(measured)
    .filter(([, px]) => !Number.isInteger(px))
    .map(([n, px]) => `${n} = ${px}px`);

  expect(fractional).toEqual([]);

  /* And EVEN, not merely whole — the 2px atom. A value that has to be halved on
     the way to the screen should not produce a fraction doing it: a centred box,
     a gap split between two edges, a mark lifted by half its own height. Half of
     an odd number is where the fractions come back in.

     The type scale is exempt, and only the type scale. A font size answers to
     the face and to the line pitch it has to stay whole against, not to this
     rule — 21 and 25 are legitimate line boxes, and forcing every size even to
     avoid them would be the tail wagging the dog. What must not happen is a
     control taking its height FROM one of those line boxes, which is how the
     superbar key came to be 33px. */
  const odd = Object.entries(measured)
    .filter(([n]) => !n.startsWith("--text-"))
    .filter(([, px]) => px % 2 !== 0)
    .map(([n, px]) => `${n} = ${px}px`);

  expect(odd, "every length but the type scale lands on the 2px atom").toEqual([]);
});

test("the page is the content plus one apparatus rail on each side", async ({ page }) => {
  /* One number is chosen — the content is 768 — and the ceiling is the only
     width derived from it. This test is the derivation, executed: if the
     ceiling ever stops being content + two rails, somebody has picked a round
     number again and the reason for the page stopping where it stops is gone. */
  const px = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const read = (t) => {
      probe.style.width = `var(${t})`;
      return parseFloat(getComputedStyle(probe).width);
    };
    const out = {
      measure: read("--measure"),
      rail: read("--rail"),
      pageWidth: read("--width-page"),
      gapRegion: read("--gap-region"),
      sidenote: read("--sidenote-width"),
      toc: read("--toc-width"),
    };
    probe.remove();
    return out;
  });

  expect(px.measure, "the content width is the one chosen number").toBe(768);
  expect(px.rail).toBe(224);

  /* Both apparatus columns are the rail, and they are equal because the layout
     is symmetrical — the text sits centred with one column of apparatus a
     side. */
  expect(px.sidenote).toBe(px.rail);
  expect(px.toc).toBe(px.rail);
  expect(px.pageWidth).toBe(px.measure + 2 * px.gapRegion + 2 * px.rail);
  expect(px.pageWidth).toBe(1280);

  for (const [name, v] of Object.entries(px)) {
    expect(Number.isInteger(v), `${name} is fractional`).toBe(true);
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

  /* Whole TRACKS are not assertable and this test no longer claims them. The
     region an item grid lives in is a leftover — the frame minus two rails —
     and an arbitrary width divided by an arbitrary count is fractional far more
     often than not: 816 across three tracks with a 20px gap is 258.67.

     That is 1fr distribution, not a token drifting. Every token IS whole, and
     the test above asserts it. What can be promised here is the invariant
     below, which holds at every width and every count. */

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
  /* Headings take a RATIO, 1.25, and that only works because the heading sizes
     are multiples of 4 — the ratio and the scale were chosen together, and
     changing either alone reintroduces fractions.

     Body takes a PITCH, 18px, and therefore cannot produce a fraction at any
     size at all. It was a 1.5 ratio until the body line was asked to sit
     closer; no ratio below 1.5 gives whole boxes at 12, 14 and 16 together,
     because 14 carries a factor of 7. The pitch is checked here anyway rather
     than assumed, because "it cannot be fractional" is exactly the kind of
     claim that stops being true when somebody changes the token back to a
     number. */
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

    /* ONE exemption, and it is narrow on purpose. base.css rules no table and
       says why, then names the case it is deferring: a table wide enough that
       the eye loses its row between the first column and the last is a tracking
       problem, not a grouping one, and the answer is "a component decision —
       zebra banding or rules". The foundation tables are that case and took the
       rules; see .docs-table in docs.css.

       So the exemption is for cells of a .docs-table and nothing else. A border
       on the table box, on a swatch, on a key, on a rail — still a failure, and
       still caught. The last border to go from this page was the one round the
       colour swatches, which went when the card behind them was tinted instead;
       nothing has been made easier for the next one. */
    const sanctioned = (el) => el.matches(".docs-table :is(th, td)");

    return [...document.querySelectorAll("main *, footer *")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        return SIDES.some((s) => parseFloat(cs[`border${s}Width`]) > 0);
      })
      .filter((el) => !sanctioned(el))
      .map((el) => `${el.tagName.toLowerCase()}${el.className ? "." + el.className : ""}`);
  });

  expect([...new Set(lined)]).toEqual([]);

  /* And the exemption is not a hole: the cells it covers must actually be ruled
     with the token, or a stray border could hide inside it. A guard that opens
     a door has to check what walks through. */
  const rules = await page.evaluate(() => {
    const hairline = getComputedStyle(document.documentElement).getPropertyValue("--hairline").trim();
    const probe = document.createElement("div");
    probe.style.color = hairline;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();

    const cells = [...document.querySelectorAll(".docs-table tbody tr + tr th")];
    return {
      count: cells.length,
      allHairline: cells.every(
        (el) => getComputedStyle(el).borderTopColor === resolved,
      ),
    };
  });

  expect(rules.count, "no ruled table rows found — did the tables render?").toBeGreaterThan(0);
  expect(rules.allHairline, "a table rule is drawn in something other than --hairline").toBe(true);

  /* The thematic breaks, which this guard cannot see at all. An <hr> draws its
     line as a BACKGROUND on a 1px box, so it has no border for the sweep above
     to find — it would pass whether it were drawn, mis-drawn, or invisible.

     Invisible is not hypothetical: it shipped that way. The element carried the
     UA's margin-inline: auto, which inside a flex column shrinks an item to its
     content, and a rule has none. Every computed value looked right and the
     line was 0 wide. So width is asserted here as well as colour. */
  const breaks = await page.evaluate(() => {
    const hairline = getComputedStyle(document.documentElement).getPropertyValue("--hairline").trim();
    const probe = document.createElement("div");
    probe.style.color = hairline;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();

    return [...document.querySelectorAll("main hr")].map((hr) => ({
      width: Math.round(hr.getBoundingClientRect().width),
      height: Math.round(hr.getBoundingClientRect().height),
      painted: getComputedStyle(hr).backgroundColor === resolved,
    }));
  });

  expect(breaks.length, "no thematic breaks found").toBeGreaterThan(0);
  for (const b of breaks) {
    expect(b.painted, "a thematic break is not drawn in --hairline").toBe(true);
    expect(b.height, "a thematic break must be one pixel tall").toBe(1);
    expect(b.width, "a thematic break collapsed to nothing").toBeGreaterThan(100);
  }
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

test("the desk keeps its three levels apart, on both stocks", async ({ page }) => {
  /* The failure this exists for: --recessed was mixed toward --ink, and --ink
     flips with the scheme, so the wash darkened its ground on light stock and
     LIGHTENED it on dark — the one direction --surface is already travelling.
     On dark the rails composited to rgb(27 27 28) against a sheet of
     rgb(26 26 28), one part in 255 apart, and the three-column desk read as one
     wide surface again. Every declared value was correct; only the composite
     was wrong.

     So this reads PIXELS, not computed styles. --recessed is translucent, and a
     translucent colour tells you nothing about what the eye receives — which is
     precisely how the collision got through. Sampling the painted page is the
     only assertion that could have caught it. */
  await page.setViewportSize({ width: 1440, height: 900 });

  const sample = async () => {
    const shot = await page.screenshot();
    return page.evaluate(async (dataUrl) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      /* The screenshot is in device pixels and the rects are in CSS pixels. */
      const scale = img.width / window.innerWidth;
      const at = (x, y) => {
        const d = ctx.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
        return [d[0], d[1], d[2]];
      };

      const shell = document.querySelector(".docs-shell").getBoundingClientRect();
      const sheet = document.querySelector(".docs-column").getBoundingClientRect();
      /* The shell is as tall as the document, so its own midpoint is nowhere
         near the screenshot. Sample down the middle of the VIEWPORT instead. */
      const y = Math.round(window.innerHeight / 2);

      return {
        /* Outside the shell entirely — bare page. */
        page: at(4, y),
        /* Midway across the band the shell leaves showing left of the sheet. */
        rail: at(shell.left + (sheet.left - shell.left) / 2, y),
        /* Inside the sheet's own gutter, so no glyph can land on the sample. */
        sheet: at(sheet.left + 10, y),
      };
    }, `data:image/png;base64,${shot.toString("base64")}`);
  };

  const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    const px = await sample();

    /* THE DIRECTION IS NOT THE SAME ON BOTH STOCKS, and asserting that it was
       is what this test used to get wrong.

       On light stock the sheet is the lightest ground and the rails step DOWN
       off it. On dark stock the sheet is the darkest ground — it has to be, to
       reach 20:1 on the text — and the rails step UP off it. What is true in
       both is the ORDER, stated relative to the sheet: the page sits between
       the sheet and the rails, and each is clearly clear of the next.

       Pinning the direction instead of the order is how a scheme-specific fact
       gets frozen into a guard and blocks the palette from moving. */
    const away = (a, b) => (luma(px.sheet) > luma(px.page) ? luma(b) - luma(a) : luma(a) - luma(b));

    /* Each step only has to be a real step, and 2 is the floor for that. The
       light page sits exactly 4 off its sheet — 251 against 255 — so a stricter
       figure here would be asserting a palette detail rather than the order.
       The distance a reader actually judges is the total, below. */
    expect(away(px.page, px.sheet), `${scheme}: the page is not clear of the sheet`)
      .toBeGreaterThan(2);
    expect(away(px.rail, px.page), `${scheme}: the rail is not clear of the page`)
      .toBeGreaterThan(2);

    /* The one the reader actually sees: which column is the work. Four steps is
       not a threshold anybody tuned — it is a floor well under the real
       separation on both stocks and well over the one-part-in-255 that a
       collision between the rails and the sheet once produced. */
    expect(Math.abs(luma(px.sheet) - luma(px.rail)), `${scheme}: the sheet does not stand off the rails`)
      .toBeGreaterThan(4);
  }
});

test("stacked corners are concentric: outer radius = inner radius + the gap", async ({ page }) => {
  /* Two rounded boxes, one inside the other, hold their gap along the edges and
     open out into the corner unless the outer curve is the inner curve plus the
     gap. The colour swatch was the case that prompted this: a 2px chip in a 2px
     card with 8px of padding measured 8 along the edges and 11.3 into the
     corner, and the card appeared to pinch its own contents.

     Equal radii are the easy way to reach that, because using one radius token
     for both reads as consistency. So the guard finds the stacks itself rather
     than naming the pair that was wrong — the next one will be built by the
     same reasoning somewhere else. */
  await page.setViewportSize({ width: 1440, height: 900 });

  /* PER CORNER, and only where a corner is actually shared.

     This started as one comparison per pair, using the tightest of the four
     insets. That over-reached the moment the page grew a control inside a
     rounded container: a copy button sitting 4px below the top of a code block
     and 12px in from its side was demanded to be concentric with it, when the
     two corners are nowhere near each other. It also failed a <pre> whose top
     corners are deliberately square because a header bar covers them.

     A corner is made by two sides. It is only concentric with the corner
     outside it when BOTH those sides are inset by the same amount — that is the
     definition, not a convenience. Where the two insets differ, the corners are
     not a pair and there is no ratio to be right or wrong about, so the guard
     says nothing rather than inventing a rule. */
  const stacks = await page.evaluate(() => {
    const CORNERS = [
      ["TopLeft", "top", "left"],
      ["TopRight", "top", "right"],
      ["BottomRight", "bottom", "right"],
      ["BottomLeft", "bottom", "left"],
    ];
    const radiusOf = (el, corner) =>
      parseFloat(getComputedStyle(el)[`border${corner}Radius`]) || 0;
    const anyRadius = (el) => CORNERS.some(([c]) => radiusOf(el, c) > 0);
    const name = (el) =>
      el.tagName.toLowerCase() + (el.className ? `.${String(el.className).trim().split(/\s+/)[0]}` : "");

    const out = [];
    for (const el of document.querySelectorAll("*")) {
      if (!anyRadius(el)) continue;

      /* The nearest rounded ANCESTOR, not the parent: an unrounded wrapper in
         between does not break the stack, it just holds it. */
      let outer = el.parentElement;
      while (outer && !anyRadius(outer)) outer = outer.parentElement;
      if (!outer) continue;

      const inner = el.getBoundingClientRect();
      const box = outer.getBoundingClientRect();
      const inset = {
        top: inner.top - box.top,
        left: inner.left - box.left,
        right: box.right - inner.right,
        bottom: box.bottom - inner.bottom,
      };

      /* A corner pair also needs the child to be AT the corner. An inline code
         word 660px inside the sheet had its bottom and right insets coincide at
         the same number, which satisfied the equal-insets test above and asked
         for a 662px radius on the sheet. Two insets matching by accident is not
         a nesting.

         A quarter of the parent's shorter side is the bound, and it is relative
         rather than a pixel count so it holds for a 130px swatch card and an
         800px sheet alike. Inside that, a child is in the corner; beyond it, the
         child is somewhere in the middle of a box that happens to contain it. */
      const reach = Math.min(box.width, box.height) / 4;

      for (const [corner, sideA, sideB] of CORNERS) {
        const a = inset[sideA];
        const b = inset[sideB];
        /* A child that breaks out of its parent is not a stack. */
        if (a < 0 || b < 0) continue;
        /* Two different insets cannot make one concentric corner. */
        if (Math.abs(a - b) > 0.5) continue;
        if (a > reach) continue;

        out.push({
          pair: `${name(outer)} > ${name(el)} [${corner}]`,
          outerR: radiusOf(outer, corner),
          innerR: radiusOf(el, corner),
          gap: Math.round(a * 10) / 10,
        });
      }
    }
    return out;
  });

  /* Assert the count before the geometry. A guard that finds no stacks looks
     exactly like a guard that passes, and this page has generated content —
     one failed script and there is nothing left to check. */
  expect(stacks.length, "no radius stacks found — did the swatch grid render?").toBeGreaterThan(0);

  const off = stacks
    .filter((s) => Math.abs(s.outerR - (s.innerR + s.gap)) > 0.5)
    .map((s) => `${s.pair}: outer ${s.outerR} should be ${s.innerR} + ${s.gap} = ${s.innerR + s.gap}`);

  expect([...new Set(off)]).toEqual([]);
});

test("nothing sets type larger than the line box it is given", async ({ page }) => {
  /* --leading-body is a PITCH, 18px, not a ratio. That guarantees a whole line
     box at every body size and creates one obligation in exchange: anything
     setting type ABOVE the body range must state its own leading, or its lines
     are shorter than its letters and consecutive lines overlap.

     One element on this page does that — the type specimen at --text-lg — and it
     was silently broken once already. Renaming the table from #faces to
     #docs-faces left the rule pointing at a selector that no longer matched, so
     the specimen quietly dropped to body size and body leading. Every test
     passed: nothing asserted the specimen, and an overlap is not an error.

     This asserts the CONDITION rather than the specimen, so it catches the next
     element to go above the body sizes as well as this one. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  const tight = await page.evaluate(() => {
    const bad = new Map();
    for (const el of document.querySelectorAll("body *")) {
      if (!el.textContent.trim()) continue;
      /* Only elements with their own text, or the measurement describes a
         container whose children carry the type. */
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!ownText) continue;

      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const lead = parseFloat(cs.lineHeight);
      if (!Number.isFinite(lead)) continue;

      /* A line box shorter than the type it holds. 1.05 rather than 1.0 because
         a box exactly the height of the em is already touching. */
      if (lead < size * 1.05) {
        const key = el.tagName.toLowerCase() + (el.className ? `.${String(el.className).trim().split(/\s+/)[0]}` : "");
        bad.set(key, `${size}px type in a ${lead}px box`);
      }
    }
    return [...bad];
  });

  expect(tight).toEqual([]);
});
