# Kashinoga Design System

Human interface guidelines for the web, and the CSS that implements them.

**Status: scaffold.** The structure is final; the values are neutral placeholders. Nothing has
been migrated from [Pixelite](../_ARCHIVE/pixelite-design-system.md) yet.

---

## Use it

```html
<link rel="stylesheet" href="styles.css" />
```

One file. No build step, no preprocessor, no framework. `styles.css` declares the cascade layers
and imports the six parts in order.

To pull one part on its own — tokens into a Figma export, the reset into a page that already has
its own components:

```css
@import url("src/tokens.css") layer(tokens);
```

## Run the docs

```
npm run dev     # serves this directory; open index.html
npm test        # source tests over the CSS — no browser, no deps
```

`index.html` opens over `file://` too, but a local server is closer to how it ships.

Both scripts need Node — it is not installed on this machine yet, so neither has been run.
The system itself has no runtime dependency on it; Node is only for the docs server and the
source tests.

## Layout

```
styles.css            entry point — declares layer order, imports the six parts
src/
  reset.css           undo browser defaults that fight the system
  tokens.css          every value the system is allowed to use
  base.css            what a bare HTML element looks like with no class on it
  layout.css          how things are arranged, with no opinion on what they are
  components.css      the named parts — deliberately empty for now
  utilities.css       single-purpose overrides, last layer, always win
index.html            the documentation page
docs.css  docs.js     styling and scripting for that page only — never shipped
test/tokens.test.js   asserts the scale is honest and the layers are ordered
```

## The decisions

**Cascade layers decide who wins, not specificity.** The order is declared once at the top of
`styles.css`, before any import. A utility always beats a component; a component always beats base
type; the reset can never beat anything. Adding a file later cannot reorder this, and no rule in
the system needs `!important` to win a fight.

**Two token tiers, and the distinction is load-bearing.** A *primitive* is a raw value with no
opinion (`--grey-100`, `--space-16`). A *semantic* token is a job (`--surface`, `--gutter`).
Components read semantic tokens only — that is what makes re-theming a swap of one block rather
than a search-and-replace across the system. `npm test` enforces it.

**Both colour schemes are written on the same line.** Every colour is a `light-dark()` pair, so
the two arms cannot fall out of step in a diff. A single percentage cannot tune both schemes: a
mix toward `--ink` moves in opposite directions on light and dark stock. Keep the arms in step by
*effect*, never by matching the numbers.

**The name of a spacing rung is its pixel count.** `--space-12` is 12px at a 16px root. A rung
whose name lies is worse than no name, so the identity is machine-asserted rather than trusted.
The base is `0.25rem`, not `0.2rem` — on a 0.2 scale only every fifth step is a whole pixel.

**Logical properties throughout.** `block`/`inline`, not `top`/`left`, so a layout transposes with
writing-mode instead of needing a mirrored stylesheet.

**Layout owns the space between things.** A component never carries its own outer margin; its
parent decides. That is the only rule that keeps a component reusable in a context its author
never saw.

**Variants are data attributes, not extra classes.** `[data-tone="ruby"]`, `[data-size="sm"]` —
they read as state in the markup and in devtools, and they cannot silently coexist the way two
conflicting classes can.

**The docs page is a consumer, not part of the system.** `docs.css` and `docs.js` live outside
`src/` and ship with nothing. Keeping them apart is the only way to notice when the docs are
propping themselves up with styles the system does not actually provide. `docs.js` reads real
computed values out of the live stylesheet — a wrong token shows up as a wrong swatch, not as a
page that still looks right.

## Next

- [ ] Migrate the Pixelite palette, four faces and materials into `src/tokens.css`
- [ ] First components: sheet, plastic key, popover
- [ ] Second theme (Aeropalite) to prove the semantic tier actually holds
- [ ] Runtime sweep at several widths *including the middle ones* — at the extremes every
      `clamp()` is pinned to an end, so bounds-only checks pass on values that are fractional
      everywhere between
