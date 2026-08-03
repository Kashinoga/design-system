import { defineConfig, devices } from "@playwright/test";

/*
 * The runtime sweep — the second of the spec's "three things that keep it
 * honest". The source tests read the CSS as text; these read what a browser
 * actually computed. Both are necessary and neither substitutes for the other:
 * a token can be perfectly well-formed in the file and resolve to nothing on
 * the page, which is exactly how --font-body was lost.
 *
 * Three engines, because the differences we care about are engine-level:
 * text-box-trim (Chromium and WebKit have it, Gecko does not) and
 * hanging-punctuation (WebKit only).
 *
 * Fonts are a different axis entirely. Font resolution comes from the OS, not
 * the engine, so all three projects here report the same families — whatever
 * this machine has. Cross-OS font answers come from the CI matrix in
 * .github/workflows/runtime.yml, which runs this same suite on macOS, Windows
 * and Linux runners.
 */

const PORT = 8141;

export default defineConfig({
  testDir: "./runtime",

  /* Kept out of test/ on purpose: `node --test` globs **∕test∕**, so a Playwright
     spec living there would be picked up by the source-test runner and fail on
     the import. Separate directory, separate extension, no overlap. */
  testMatch: "**/*.spec.js",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    /* Pin the scheme rather than inherit the runner's. A suite that silently
       follows the machine's preference tests one arm on a laptop and the other
       in CI, and neither result means what it says. Tests that care about dark
       set it explicitly via emulateMedia. */
    colorScheme: "light",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],

  webServer: {
    command: `node tools/serve.js ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
  },
});
