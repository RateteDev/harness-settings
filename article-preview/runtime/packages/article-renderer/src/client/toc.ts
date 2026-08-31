/**
 * Client control for the article table of contents: scroll-spy active-section
 * tracking and header-height offset sync. Source of truth for both the web app
 * and the CLI's standalone HTML.
 *
 * Navigation itself is native: each entry is an anchor to the heading id, and
 * headings carry `scroll-margin-top` bound to `--scroll-offset`, so the browser
 * handles the jump, focus move, history and `prefers-reduced-motion` on its own.
 * The whole function is bound via a dataset flag on `#tocList`, so repeat calls
 * are a no-op.
 */

export function initToc(): void {
  const tocList = document.getElementById("tocList");
  if (!tocList || tocList.dataset.tocBound === "1") {
    return;
  }
  tocList.dataset.tocBound = "1";

  const items = tocList.querySelectorAll<HTMLElement>("li");
  const wideLayout = window.matchMedia("(width >= 1380px)");
  const header = document.querySelector<HTMLElement>(".site-header");

  function setActive(slug: string) {
    if (!wideLayout.matches) return;
    for (const li of items) {
      li.classList.toggle("active", li.dataset.target === slug);
    }
  }

  // What the headings already reserve above themselves, resolved by the browser.
  // Reading it back rather than recomputing it keeps the observer in step with
  // the page whether a header sets the offset or the stylesheet states it.
  function getScrollOffset(): number {
    const first = targets[0];
    return first ? parseFloat(getComputedStyle(first).scrollMarginTop) : 0;
  }

  function syncHeaderOffset() {
    if (!header) return;
    const h = header.offsetHeight;
    const s = document.documentElement.style;
    s.setProperty("--toc-offset", `calc(${h}px + 1rem)`);
    s.setProperty("--scroll-offset", `calc(${h}px + 1.5rem)`);
  }

  wideLayout.addEventListener("change", (e) => {
    if (e.matches) return;
    for (const li of items) li.classList.remove("active");
  });

  // Mark the chosen entry immediately; the observer catches up once the scroll lands.
  for (const li of items) {
    li.addEventListener("click", () => {
      const id = li.dataset.target;
      if (id) setActive(id);
    });
  }

  const targets = Array.from(items)
    .map((li) => li.dataset.target)
    .filter((id): id is string => Boolean(id))
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => Boolean(el));

  let tocObserver: IntersectionObserver | null = null;

  function rebuildTocObserver() {
    if (tocObserver) tocObserver.disconnect();
    const offset = Math.round(getScrollOffset());
    tocObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: `-${offset}px 0px -70% 0px`, threshold: 0 },
    );
    for (const el of targets) tocObserver.observe(el);
  }

  if (header) {
    new ResizeObserver(() => {
      syncHeaderOffset();
      rebuildTocObserver();
    }).observe(header);
  }
  syncHeaderOffset();
  rebuildTocObserver();
}
