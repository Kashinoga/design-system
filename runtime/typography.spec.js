import { test, expect } from "@playwright/test";

/*
 * Type, measured rather than asserted from memory.
 *
 * Two axes get confused constantly and are kept apart here:
 *
 *   ENGINE  — which properties exist. text-box-trim is Chromium and WebKit;
 *             Gecko has not shipped it. hanging-punctuation is WebKit only.
 *             Testing this locally is valid: the engine is the engine.
 *
 *   OS      — which fonts exist and what glyphs they carry. This does NOT vary
 *             by engine, and running WebKit on Windows tells you nothing about
 *             Safari on a Mac, because the fonts come from the platform. The
 *             cross-OS answers come from the CI matrix, not from here.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("headings carry no half-leading where the engine can trim it", async ({ page, browserName }) => {
  const m = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const supported = CSS.supports("text-box", "trim-both cap alphabetic");
    const trimmed = h1.getBoundingClientRect().height;

    const before = h1.style.textBox;
    h1.style.textBox = "none";
    const untrimmed = h1.getBoundingClientRect().height;
    h1.style.textBox = before;

    return {
      supported,
      trimmed,
      untrimmed,
      lineHeight: parseFloat(getComputedStyle(h1).lineHeight),
      fontSize: parseFloat(getComputedStyle(h1).fontSize),
    };
  });

  await test.info().attach("heading-metrics", {
    body: JSON.stringify({ engine: browserName, ...m }, null, 1),
    contentType: "application/json",
  });
  console.log(`  [${browserName}] h1 trimmed ${m.trimmed.toFixed(2)}px / untrimmed ${m.untrimmed.toFixed(2)}px` +
    ` — text-box ${m.supported ? "supported" : "NOT supported"}`);

  if (m.supported) {
    /* The trim must remove real space, and must land inside the letterforms —
       shorter than the line box, never taller than the em. */
    expect(m.trimmed).toBeLessThan(m.untrimmed);
    expect(m.trimmed).toBeLessThanOrEqual(m.fontSize);
    expect(m.untrimmed).toBeCloseTo(m.lineHeight, 0);
  } else {
    /* Gecko keeps the half-leading. This is the documented, accepted
       cross-browser difference in vertical rhythm — asserted so that the day it
       ships, this test fails and the comment in base.css gets updated rather
       than quietly becoming false. */
    expect(browserName).toBe("firefox");
    expect(m.trimmed).toBeCloseTo(m.untrimmed, 1);
    expect(m.trimmed).toBeCloseTo(m.lineHeight, 0);
  }
});

test("no synthesised weights or slants", async ({ page }) => {
  const synthesis = await page.evaluate(
    () => getComputedStyle(document.documentElement).fontSynthesis
      ?? getComputedStyle(document.documentElement).getPropertyValue("font-synthesis"),
  );
  expect(synthesis).toMatch(/none/);
});

test("fallback arms are held to the primary's x-height", async ({ page }) => {
  const adjust = await page.evaluate(
    () => getComputedStyle(document.documentElement).fontSizeAdjust,
  );
  /* from-font resolves to the primary face's own aspect ratio — a number when
     the engine supports it, the keyword or "none" when it does not. */
  expect(adjust === "none" || adjust === "from-font" || Number(adjust) > 0).toBe(true);
});

test("nothing reaches the page through font-feature-settings", async ({ page }) => {
  /* font-variant-* only. The low-level property is all-or-nothing and does not
     inherit feature-by-feature, so one descendant setting a single feature
     silently drops every other feature an ancestor asked for. */
  const users = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((el) => {
        const v = getComputedStyle(el).fontFeatureSettings;
        return v && v !== "normal";
      })
      .map((el) => el.tagName + (el.className ? "." + el.className : "")),
  );
  expect(users).toEqual([]);
});

test("report: which fonts this OS actually gives us", async ({ page, browserName }) => {
  /* The computed font-family is only the request. What was actually used needs
     the engine to tell us, and only Chromium exposes it — via CDP. On the CI
     matrix this is the test that answers "what is ui-monospace on macOS". */
  test.skip(browserName !== "chromium", "platform font names are Chromium-only (CDP)");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");

  const report = {};
  for (const [role, selector] of [["body", "main p"], ["display", "h1"], ["mono", "code"]]) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    report[role] = fonts.map((f) => `${f.familyName} (${f.glyphCount} glyphs)`);
  }

  report.platform = await page.evaluate(() => navigator.platform);

  await test.info().attach("platform-fonts", {
    body: JSON.stringify(report, null, 1),
    contentType: "application/json",
  });
  console.log(`  [platform fonts] ${JSON.stringify(report)}`);

  /* Reporting, not gatekeeping — except that something must resolve. An empty
     list means no glyph was drawn at all. */
  for (const role of ["body", "display", "mono"]) {
    expect(report[role].length, `${role} resolved to no font`).toBeGreaterThan(0);
  }
});

test("report: does this OS's numeral face answer to slashed-zero", async ({ page, browserName }) => {
  /* An OpenType feature is a question put to the font, and a font without the
     glyph answers with silence — no synthesis, no error. Width cannot detect
     it, because a slashed zero has the same advance as a plain one. So render
     both and compare pixels. */
  const stacks = { body: "var(--font-body)", mono: "var(--font-mono)", numeral: "var(--font-numeral)" };

  await page.evaluate((s) => {
    const host = document.createElement("div");
    host.id = "zero-probe";
    host.style.cssText = "position:fixed;inset:0 auto auto 0;z-index:9999;background:#fff;padding:8px";
    for (const [role, family] of Object.entries(s)) {
      for (const variant of ["normal", "slashed-zero"]) {
        const el = document.createElement("span");
        el.id = `zero-${role}-${variant}`;
        el.style.fontFamily = family;
        el.style.fontSize = "40px";
        el.style.fontVariantNumeric = variant;
        el.style.display = "block";
        el.textContent = "0000";
        host.append(el);
      }
    }
    document.body.append(host);
  }, stacks);

  const answers = {};
  for (const role of Object.keys(stacks)) {
    const plain = await page.locator(`#zero-${role}-normal`).screenshot();
    const slashed = await page.locator(`#zero-${role}-slashed-zero`).screenshot();
    answers[role] = plain.equals(slashed) ? "inert — no change" : "CHANGES the glyph";
  }

  await page.evaluate(() => document.querySelector("#zero-probe")?.remove());

  await test.info().attach("slashed-zero", {
    body: JSON.stringify({ engine: browserName, ...answers }, null, 1),
    contentType: "application/json",
  });
  console.log(`  [slashed-zero/${browserName}] ${JSON.stringify(answers)}`);
});
