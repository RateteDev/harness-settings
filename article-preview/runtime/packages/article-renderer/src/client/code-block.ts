/**
 * Client controls for `.code-block-wrapper` blocks: copy-to-clipboard, word-wrap
 * toggle, and collapse/expand toggle for tall blocks.
 * Ported from apps/web/src/components/article-parts/parts/code-block.astro.
 */

import { copyText } from "./clipboard";
import { prefersReducedMotion } from "./motion";

const RESET_MS = 1500;

/**
 * Upper bound on the frames spent holding a collapsing block in place. The
 * hold normally ends on `transitionend`; this only stops a dropped event from
 * leaving the loop running, so it is a ceiling rather than a copy of the
 * transition's duration.
 */
const MAX_HOLD_FRAMES = 60;

/** Wire the copy-to-clipboard button in each code block header. */
export function initCodeCopy(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".code-block-wrapper .code-copy");
  for (const button of buttons) {
    if (button.dataset.copyBound === "1") {
      continue;
    }
    button.dataset.copyBound = "1";
    button.addEventListener("click", async () => {
      const wrapper = button.closest<HTMLElement>(".code-block-wrapper");
      if (!wrapper) {
        return;
      }
      const pre = wrapper.querySelector<HTMLElement>("pre");
      const source = button.dataset.source ?? pre?.innerText ?? "";
      try {
        await copyText(source);
        button.classList.add("is-copied");
        window.setTimeout(() => {
          button.classList.remove("is-copied");
        }, RESET_MS);
      } catch (error) {
        console.error("[code-block] copy failed", error);
      }
    });
  }
}

/** Wire the word-wrap toggle button in each code block header. */
export function initWrapToggle(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    ".code-block-wrapper .code-wrap-toggle",
  );
  for (const button of buttons) {
    if (button.dataset.wrapBound === "1") {
      continue;
    }
    button.dataset.wrapBound = "1";
    button.addEventListener("click", () => {
      const wrapper = button.closest<HTMLElement>(".code-block-wrapper");
      if (!wrapper) {
        return;
      }
      wrapper.classList.toggle("is-wrapped");
    });
  }
}

/** Wire the bottom expand/collapse toggle for collapsible code blocks. */
export function initCollapseToggle(): void {
  const wrappers = document.querySelectorAll<HTMLElement>(".code-block-wrapper[data-collapsible]");
  for (const wrapper of wrappers) {
    if (wrapper.dataset.collapseBound === "1") continue;
    wrapper.dataset.collapseBound = "1";

    const pre = wrapper.querySelector<HTMLElement>("pre");
    if (!pre) continue;

    // The stylesheet knows the folded ceiling but not the expanded height, so
    // the script measures it and drives the transition between the two. Handing
    // the height back to the stylesheet afterwards lets an expanded block keep
    // growing with its content, which the word-wrap toggle relies on.
    const releaseHeight = () => {
      pre.style.maxHeight = "";
    };

    // Both events are needed: an interrupted transition reports `transitioncancel`
    // and never `transitionend`, and missing it would leave the measured height
    // pinned to the element for good.
    const onHeightSettled = (event: TransitionEvent) => {
      if (event.propertyName === "max-height" && wrapper.classList.contains("is-expanded")) {
        releaseHeight();
      }
    };
    pre.addEventListener("transitionend", onHeightSettled);
    pre.addEventListener("transitioncancel", onHeightSettled);

    /**
     * Keeps the block's bottom edge, and with it the button the reader just
     * pressed, at the same point on screen while the block shrinks. Only a
     * block whose top has scrolled off needs this: everything below such a
     * block rises by the height it loses, stranding the reader further down
     * the page. Scroll anchoring does not cover it, because that only
     * compensates for size changes above the viewport.
     */
    const holdBottomEdge = (target: number) => {
      if (prefersReducedMotion()) {
        window.scrollBy({
          top: wrapper.getBoundingClientRect().bottom - target,
          behavior: "instant",
        });
        return;
      }

      let frames = 0;
      let running = true;
      const stop = () => {
        running = false;
        pre.removeEventListener("transitionend", stop);
        pre.removeEventListener("transitioncancel", stop);
      };
      const step = () => {
        if (!running) return;
        const drift = wrapper.getBoundingClientRect().bottom - target;
        // `behavior` is stated because the document sets `scroll-behavior:
        // smooth`. Inheriting it would start a fresh easing scroll every frame,
        // each fighting the last, and the correction would shake rather than
        // track the height.
        if (drift !== 0) window.scrollBy({ top: drift, behavior: "instant" });
        if (++frames < MAX_HOLD_FRAMES) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      pre.addEventListener("transitionend", stop);
      pre.addEventListener("transitioncancel", stop);
    };

    const toggle = () => {
      const wasExpanded = wrapper.classList.contains("is-expanded");
      const box = wrapper.getBoundingClientRect();
      pre.style.maxHeight = `${pre.scrollHeight}px`;

      if (wasExpanded) {
        // Reading the layout forces the measured height to take effect before
        // the class flips, without which the block drops to the folded height
        // in a single frame instead of travelling there.
        void pre.offsetHeight;
        wrapper.classList.remove("is-expanded");
        releaseHeight();
        if (box.top < 0) holdBottomEdge(box.bottom);
        return;
      }

      wrapper.classList.add("is-expanded");
      // No transition runs under reduced motion, so `transitionend` never
      // fires and the measured height would stay pinned to the element.
      if (prefersReducedMotion()) {
        releaseHeight();
      }
    };

    const bottomBtn = wrapper.querySelector<HTMLButtonElement>(".code-collapse-toggle");
    bottomBtn?.addEventListener("click", toggle);
  }
}
