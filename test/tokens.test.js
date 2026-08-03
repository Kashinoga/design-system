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

test("the spacing scale is built on a 2px base and never narrows", () => {
  const rungs = [...tokens.matchAll(/--space-(\d+):/g)].map((m) => Number(m[1]));

  assert.ok(rungs.length >= 12, `expected at least 12 rungs, found ${rungs.length}`);
  assert.deepEqual(rungs, [...rungs].sort((a, b) => a - b), "rungs are not in ascending order");
  assert.equal(new Set(rungs).size, rungs.length, "a rung is declared twice");
  assert.equal(rungs[0], 2, "the scale must start at the 2px base unit");

  for (const n of rungs) {
    assert.equal(n % 2, 0, `--space-${n} is off the 2px base`);
  }

  /* Strides widen as the scale climbs, because spacing is read proportionally —
     2px is decisive at 8px and invisible at 64px. What they must never do is
     NARROW: a ladder whose steps shrink as it rises reads as a mistake, which is
     the failure the old fixed-stride rule was really guarding against. */
  const strides = rungs.slice(1).map((n, i) => n - rungs[i]);
  for (let i = 1; i < strides.length; i++) {
    assert.ok(
      strides[i] >= strides[i - 1],
      `the scale narrows at --space-${rungs[i + 1]}: stride went ${strides[i - 1]} -> ${strides[i]}`,
    );
  }
});

test("each grouping tier is at least twice the one below it", () => {
  /* This is the rule that makes space work as a substitute for lines. Grouping
     by proximity only reads if the gaps are clearly unequal — two groups 10px
     apart with 8px inside them are not two groups, they are one group with a
     wobble. Without this ratio the system quietly drifts back into needing
     borders to say what the spacing failed to. */
  const TIERS = ["--gap-tight", "--gap-within", "--gap-between", "--gap-section"];

  const px = TIERS.map((tier) => {
    const alias = tokens.match(new RegExp(`${tier}:\\s*var\\(--space-(\\d+)\\)`));
    assert.ok(alias, `${tier} must resolve to a named rung, not a literal`);
    return { tier, value: Number(alias[1]) };
  });

  for (let i = 1; i < px.length; i++) {
    assert.ok(
      px[i].value >= px[i - 1].value * 2,
      `${px[i].tier} (${px[i].value}px) must be at least twice ${px[i - 1].tier} (${px[i - 1].value}px)`,
    );
  }
});

test("the layers that arrange things draw no lines", () => {
  /* Space does the delineating. A border in the layout layer means a spacing
     decision was skipped and papered over with ink. The two sanctioned
     exceptions — a moving boundary, and a boundary that is itself the content —
     are both in docs.css, which is not part of the system. */
  for (const name of ["layout.css", "base.css"]) {
    const withoutComments = src(name).replace(/\/\*[\s\S]*?\*\//g, "");
    const borders = [...withoutComments.matchAll(/^\s*(border[\w-]*)\s*:\s*([^;]+);/gm)]
      /* `border: 0` and box-sizing are not lines; radius is a shape, not an edge. */
      .filter(([, prop, value]) => !/radius|collapse|spacing/.test(prop) && !/^0$/.test(value.trim()));

    assert.deepEqual(borders.map((m) => m[0].trim()), [], `${name} draws a line`);
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

test("comment markers are balanced in every stylesheet", () => {
  // A stray close-comment marker reopens the file as raw CSS, and the parser's
  // error recovery silently eats everything up to the next semicolon — which is
  // one whole declaration. Nothing looks broken: the rest of the file still
  // applies and the token just quietly resolves to nothing. Caught once the hard
  // way, when --font-body went missing and every paragraph fell back to Times.
  const FILES = ["reset.css", "tokens.css", "base.css", "layout.css", "components.css", "utilities.css"];

  for (const name of FILES) {
    const text = src(name);
    let depth = 0;

    for (let i = 0; i < text.length - 1; i++) {
      if (text[i] === "/" && text[i + 1] === "*") {
        assert.equal(depth, 0, `${name}: nested /* at index ${i} — CSS comments do not nest`);
        depth++;
        i++;
      } else if (text[i] === "*" && text[i + 1] === "/") {
        assert.equal(depth, 1, `${name}: stray */ at index ${i} — closes a comment that was never opened`);
        depth--;
        i++;
      }
    }

    assert.equal(depth, 0, `${name}: unterminated comment — the rest of the file is inert`);
  }
});

test("every type token is declared exactly once", () => {
  for (const token of ["--font-body", "--font-display", "--font-mono", "--font-numeral"]) {
    const declarations = [...tokens.matchAll(new RegExp(`^\\s*${token}:`, "gm"))];
    assert.equal(declarations.length, 1, `${token} is declared ${declarations.length} times`);
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
