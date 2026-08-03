/*
 * A source test, per the spec's "three things that keep it honest".
 * Reads the CSS as text — no browser, no build, no deps. Run with:
 *
 *     node --test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), "utf8");

const tokens = src("tokens.css");

test("every --space-N rung equals N pixels at a 16px root", () => {
  const rungs = [...tokens.matchAll(/--space-(\d+):\s*([\d.]+)rem;/g)];

  /* Assert the count before the geometry. A guard that matches nothing looks
     exactly like a guard that passes. */
  assert.ok(rungs.length >= 11, `expected at least 11 rungs, found ${rungs.length}`);

  for (const [, name, rem] of rungs) {
    assert.equal(
      Number(rem) * 16,
      Number(name),
      `--space-${name} is ${rem}rem = ${Number(rem) * 16}px — the name lies`,
    );
  }
});

test("the spacing scale is a 4px scale with no gaps", () => {
  const rungs = [...tokens.matchAll(/--space-(\d+):/g)].map((m) => Number(m[1]));

  assert.deepEqual(rungs, [...rungs].sort((a, b) => a - b), "rungs are not in ascending order");

  for (const n of rungs) {
    assert.equal(n % 4, 0, `--space-${n} is off the 4px scale`);
  }

  for (let i = 1; i < rungs.length; i++) {
    assert.equal(rungs[i] - rungs[i - 1], 4, `gap between --space-${rungs[i - 1]} and --space-${rungs[i]}`);
  }
});

test("components read semantic tokens, never primitives", () => {
  /* A component that reads --grey-100 instead of --surface cannot be themed,
     only rewritten. Primitives are defined in tokens.css and used there only. */
  const PRIMITIVE = /var\(--(?:grey-\d{3}|accent-(?:light|dark)|(?:emerald|ruby|topaz)-(?:light|dark))\)/;

  for (const name of ["base.css", "layout.css", "components.css", "utilities.css"]) {
    const match = src(name).match(PRIMITIVE);
    assert.equal(match, null, `${name} reads a primitive token: ${match?.[0]}`);
  }
});

test("the cascade layer order is declared before anything is imported", () => {
  const entry = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");
  const layerLine = entry.indexOf("@layer ");
  const firstImport = entry.indexOf("@import ");

  assert.ok(layerLine !== -1, "no @layer statement in styles.css");
  assert.ok(firstImport !== -1, "no @import in styles.css");
  assert.ok(layerLine < firstImport, "@layer order must be declared before the first @import");
});
