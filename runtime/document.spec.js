import { test, expect } from "@playwright/test";

/*
 * The document structure, measured.
 *
 * Written after a structure review turned up a defect that no amount of reading
 * would have settled: a <p> cannot contain a <figure>, and the parser does not
 * say so. It closes the paragraph, lifts the figure out, and leaves a stray
 * empty <p> behind. The tree you styled is not the tree you wrote.
 */

const DOC = `
  <div class="document">
    <nav aria-label="Contents"><ol><li><a href="#d1">First division</a></li></ol></nav>
    <article>
      <header>
        <h1>Title</h1>
        <p>Authors</p>
        <p>Abstract</p>
      </header>
      <section id="d1">
        <h2>First division</h2>
        <p>One</p>
        <p>Two</p>
        <figure><img alt="" width="10" height="10"><figcaption>Caption</figcaption></figure>
        <aside>A note.</aside>
      </section>
      <section>
        <h2>Second division</h2>
        <p>Three</p>
      </section>
      <footer><p>Colophon</p></footer>
    </article>
  </div>
`;

/* The probe host carries .container because the contents rail is enabled by a
   query against the nearest ANCESTOR container. Without one the query never
   matches and the stacked form stays — degraded, not broken — which is exactly
   what the narrow case below asserts. */
async function mount(page, width = 900, host = 900) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/index.html");
  return page.evaluate(([html, hostWidth]) => {
    const el = document.createElement("div");
    el.id = "doc-probe";
    el.className = "container";
    /* An EXPLICIT width, and mounted on the BODY rather than inside the page.
       The probe used to inherit whatever the docs page gave it, so adding rails
       to that page silently narrowed the thing under test and three primitive
       tests failed for a reason that had nothing to do with the primitive. */
    el.style.cssText = `position:absolute;inset-block-start:0;inline-size:${hostWidth}px`;
    el.innerHTML = html;
    document.body.append(el);
  }, [DOC, host]);
}

test("the authored tree survives the parser", async ({ page }) => {
  await mount(page);

  const shape = await page.evaluate(() => {
    const art = document.querySelector("#doc-probe .document > article");
    return {
      children: [...art.children].map((c) => c.tagName),
      figureInsideParagraph: !!art.querySelector("p figure"),
      emptyParagraphs: [...art.querySelectorAll("p")].filter((p) => !p.textContent.trim()).length,
      figureParent: art.querySelector("figure").parentElement.tagName,
      captionParent: art.querySelector("figcaption").parentElement.tagName,
    };
  });

  expect(shape.children).toEqual(["HEADER", "SECTION", "SECTION", "FOOTER"]);

  /* The defect this file exists for. A figure must never end up inside a
     paragraph, and no empty paragraph may appear that the author did not
     write — that is the parser silently restructuring the document. */
  expect(shape.figureInsideParagraph).toBe(false);
  expect(shape.emptyParagraphs).toBe(0);
  expect(shape.figureParent).toBe("SECTION");
  expect(shape.captionParent).toBe("FIGURE");
});

test("the banner is the article's own header, not a sibling of it", async ({ page }) => {
  await mount(page);

  const banner = await page.evaluate(() => {
    const art = document.querySelector("#doc-probe .document > article");
    const header = art.querySelector(":scope > header");
    return {
      insideArticle: art.contains(header),
      isFirstChild: art.firstElementChild === header,
      carriesTheTitle: !!header.querySelector("h1"),
      /* What a reader gets when they select and copy the article. */
      copyIncludesTitle: art.textContent.includes("Title"),
    };
  });

  expect(banner).toEqual({
    insideArticle: true,
    isFirstChild: true,
    carriesTheTitle: true,
    copyIncludesTitle: true,
  });
});

test("divisions are separated by a section gap, and prose keeps the beat", async ({ page }) => {
  await mount(page);

  const m = await page.evaluate(() => {
    const art = document.querySelector("#doc-probe .document > article");
    const gap = (a, b) => Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom);
    const [s1, s2] = art.querySelectorAll(":scope > section");
    const header = art.querySelector(":scope > header");
    const [p1, p2] = s1.querySelectorAll("p");

    const probe = document.createElement("div");
    art.append(probe);
    const read = (t) => {
      probe.style.width = `var(${t})`;
      return parseFloat(getComputedStyle(probe).width);
    };
    const unit = read("--space");
    const section = read("--gap-section");
    probe.remove();

    return {
      headerToSection: gap(header, s1),
      sectionToSection: gap(s1, s2),
      paragraphToParagraph: gap(p1, p2),
      unit,
      section,
    };
  });

  expect(m.paragraphToParagraph).toBe(m.unit * 2);
  expect(m.sectionToSection).toBe(m.section);
  expect(m.headerToSection).toBe(m.section);
});

test("a caption sits ON its figure, below the floor on purpose", async ({ page }) => {
  await mount(page);

  const m = await page.evaluate(() => {
    const fig = document.querySelector("#doc-probe figure");
    const img = fig.querySelector("img");
    const cap = fig.querySelector("figcaption");

    const probe = document.createElement("div");
    document.body.append(probe);
    const read = (t) => {
      probe.style.width = `var(${t})`;
      return parseFloat(getComputedStyle(probe).width);
    };
    const tight = read("--gap-tight");
    const unit = read("--space");
    probe.remove();

    return {
      gap: Math.round(cap.getBoundingClientRect().top - img.getBoundingClientRect().bottom),
      tight,
      unit,
    };
  });

  /* A caption is not separated from its figure; it is part of it. This is the
     one place the [s] floor does not apply, and the reason is that there are
     not two elements here — there is one figure. */
  expect(m.gap).toBe(m.tight);
  expect(m.gap).toBeLessThan(m.unit);
});

test("there is no second banner landmark", async ({ page }) => {
  await mount(page);

  /* <header> as a child of <body> is the `banner` landmark. A site hero AND a
     superbar would give the page two, and a reader navigating by landmark
     could not tell which is the site header. So the hero is not a separate
     element — it is the article's own header, and an <article><header> is a
     plain header with no landmark role at all. */
  const landmarks = await page.evaluate(() => ({
    bodyLevelHeaders: [...document.body.children].filter((el) => el.tagName === "HEADER").length,
    articleHeaderIsScoped: !!document.querySelector("#doc-probe article > header"),
    heroElements: document.querySelectorAll(".hero, #hero").length,
  }));

  expect(landmarks.bodyLevelHeaders).toBe(1);
  expect(landmarks.articleHeaderIsScoped).toBe(true);
  expect(landmarks.heroElements).toBe(0);
});

test("the contents list stacks when narrow and rails when wide", async ({ page }) => {
  const read = () =>
    page.evaluate(() => {
      const nav = document.querySelector("#doc-probe .document > nav");
      const art = document.querySelector("#doc-probe .document > article");
      const n = nav.getBoundingClientRect();
      const a = art.getBoundingClientRect();
      return {
        position: getComputedStyle(nav).position,
        /* Stacked: the contents sit entirely above the article. Railed: they
           sit beside it, so their vertical ranges overlap. */
        above: Math.round(n.bottom) <= Math.round(a.top),
        beside: Math.round(n.right) <= Math.round(a.left) && n.top < a.bottom,
      };
    });

  await mount(page, 600, 600);
  const narrow = await read();

  await mount(page, 1800, 1600);
  const wide = await read();

  expect(narrow.above, "narrow must put the contents above the article").toBe(true);
  expect(narrow.position).toBe("static");

  expect(wide.beside, "wide must put the contents beside the article").toBe(true);
  expect(wide.position, "a contents list that scrolls away is not a contents list").toBe("sticky");
});

test("the contents come before the text in reading order, at every width", async ({ page }) => {
  /* The rail is a grid placement, not a reorder. A reader on a screen reader or
     with CSS off must still meet the contents first — which is why the narrow
     form is the authored order and the rail only moves it visually. */
  for (const width of [600, 1400]) {
    await mount(page, width, width);
    const order = await page.evaluate(() => {
      const doc = document.querySelector("#doc-probe .document");
      return [...doc.children].map((c) => c.tagName);
    });
    expect(order, `DOM order at ${width}px`).toEqual(["NAV", "ARTICLE"]);
  }
});

test("a sidenote is inline when narrow and in the margin when wide", async ({ page }) => {
  const read = () =>
    page.evaluate(() => {
      const aside = document.querySelector("#doc-probe aside");
      const cs = getComputedStyle(aside);
      const p = aside.closest("section").querySelector("p");
      return {
        float: cs.float,
        /* In the margin the note starts to the right of where the text ends. */
        startsAfterTextEnds:
          Math.round(aside.getBoundingClientRect().left) >= Math.round(p.getBoundingClientRect().right),
      };
    });

  await mount(page, 480, 480);
  const narrow = await read();

  await mount(page, 1800, 1600);
  const wide = await read();

  expect(narrow.float, "a narrow container must keep the note in the flow").toBe("none");
  expect(narrow.startsAfterTextEnds).toBe(false);

  /* Reported rather than asserted when the engine lacks the logical keyword —
     `float: inline-end` is newer than the container query around it, and a
     silent no-op here would look exactly like a passing test. */
  expect(wide.float, "a wide container must move the note to the margin").not.toBe("none");
  expect(wide.startsAfterTextEnds).toBe(true);
});
