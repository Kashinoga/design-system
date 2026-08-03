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

test("the page never scrolls sideways", async ({ page }) => {
  for (const width of [320, 480, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/index.html");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
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
