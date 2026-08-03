# Kashinoga Design System

Human interface guidelines for the web, and the CSS that implements them.

## The premise

**A technical document viewer you would actually want to do research in.** Classic, old-school link
underlines and the reading conventions that came with them, given a modern technical flare that is
genuinely nice to look at. Data that is pleasant to read and a surface that is fun to work in.

That premise decides arguments. A link is underlined because that is what a link has looked like
since the web had links, and a reader scanning for citations should not have to hover to find them.
Density is a feature, not a compromise — someone doing research wants more on screen, not a landing
page. And the system pays for its restraint elsewhere: no borders, no chrome for its own sake, so
the attention it does spend lands on the content.

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
npm run dev           # serves this directory; open index.html
npm test              # source tests over the CSS — no browser, no deps
npm run test:runtime  # runtime sweep in Chromium, Gecko and WebKit
npm run test:all      # both
```

`index.html` opens over `file://` too, but a local server is closer to how it ships.

Both scripts need Node; the system itself has no runtime dependency on it. Node is only for the
docs server and the source tests.

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
test/tokens.test.js   source tests — the CSS read as text
runtime/*.spec.js     runtime sweep — what a browser actually computed
tools/serve.js        static server, standard library only, no dependency
```

## Two kinds of test, and neither substitutes for the other

`test/` reads the CSS **as text**: the scale is whole, comment markers balance, no component reads a
primitive, the layer order precedes the imports. No browser, no dependencies, instant.

`runtime/` reads what a browser **actually computed**. This exists because of a bug the source tests
could not have caught: a stray comment marker made the parser discard the whole `--font-body`
declaration, so the token was present in the file, spelled correctly, and resolved to nothing. The
page still rendered. Only a browser knew — and only because someone looked at a screenshot.

Both are the spec's "three things that keep it honest": a source test, a runtime sweep at several
widths *including the middle ones* (at the extremes every `clamp()` is pinned to an end, so
bounds-only checks pass on values that are fractional everywhere between), and an audit tool. The
third is still missing.

**Engine and OS are different axes, and confusing them wastes time.** Which *properties* exist is an
engine question — `text-box-trim` is Chromium and WebKit, Gecko hasn't shipped it — and running all
three engines locally answers it honestly. Which *fonts* exist and what glyphs they carry is an OS
question. Font resolution comes from the platform, so WebKit-on-Windows renders Segoe UI and tells
you nothing about Safari on a Mac. That's what `.github/workflows/runtime.yml` is for: the same
suite on macOS, Windows and Linux runners. The macOS runner carries the genuine Apple font set,
which is why this can't be a container job.

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

**The type stacks default to the platform's own faces.** `system-ui`, `ui-sans-serif`,
`ui-monospace` — no webfont, no `@font-face`, no network request, no flash of unstyled text. The
first paint is the final paint, and the system looks native until something deliberately makes it
look otherwise. Firefox implements only `system-ui`, so the plain generic behind each `ui-*` keyword
catches it — and that generic is the user's own configured font, which is still a system face and
arguably the more correct one. A named face, when one is wanted, replaces the *head* of a stack; it
is never the fallback, so a font that fails to load degrades to the platform face rather than to
whatever the browser picks last.

**Half-leading is trimmed off headings.** A line box is taller than its letters — the leading is
split above and below, so a heading ships invisible padding belonging to no rung. Measured on the
docs h1: a 42.23px box around 24.64px of letterform, 17.6px of dead space. `text-box: trim-both cap
alphabetic` removes it, which is what lets `--space-16` between a heading and its content *measure*
16px. Firefox hasn't shipped it and keeps the old leading; that difference is accepted deliberately,
because the alternative is per-level negative margins that drift the moment a face changes.

**No synthesised weights or slants** (`font-synthesis: none`). A faked bold is a weight that exists
in no font file and differs per platform. Refusing it turns a missing weight into something visible
during development rather than a plausible lie in production.

**`font-variant-*`, never `font-feature-settings`.** Same job, different altitude — but the
low-level property is all-or-nothing and doesn't inherit feature-by-feature, so a descendant setting
one feature silently drops every other feature its ancestor asked for.

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
