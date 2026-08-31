/**
 * Client controls for prerendered `.mermaid-block-wrapper` diagrams: copy (PNG or
 * raw source) and preview/raw-source view toggle. Diagrams are prerendered to
 * inline SVG at build time, so no Mermaid runtime is loaded here.
 * Ported from apps/web/src/components/article-parts/parts/mermaid.astro.
 */

import { copyPng, copyText } from "./clipboard";

const RESET_MS = 1500;

/** Wire the copy button in each mermaid block header (copies PNG when available, else raw source). */
export function initMermaidCopy(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".mermaid-block-wrapper .code-copy");
  for (const button of buttons) {
    if (button.dataset.copyBound === "1") {
      continue;
    }
    button.dataset.copyBound = "1";
    button.addEventListener("click", async () => {
      const wrapper = button.closest<HTMLElement>(".mermaid-block-wrapper");
      const isRaw = wrapper?.classList.contains("is-raw") ?? false;
      try {
        if (isRaw) {
          await copyText(button.dataset.source ?? "");
        } else {
          const pngUri = button.dataset.png;
          if (pngUri) {
            await copyPng(pngUri);
          } else {
            await copyText(button.dataset.source ?? "");
          }
        }
        button.classList.add("is-copied");
        window.setTimeout(() => {
          button.classList.remove("is-copied");
        }, RESET_MS);
      } catch (error) {
        console.error("[mermaid] copy failed", error);
      }
    });
  }
}

/** Wire the preview/raw-source view toggle for each mermaid block. */
export function initMermaidViewToggle(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    ".mermaid-block-wrapper .mermaid-view-toggle",
  );
  for (const button of buttons) {
    if (button.dataset.viewBound === "1") {
      continue;
    }
    button.dataset.viewBound = "1";
    button.addEventListener("click", () => {
      const wrapper = button.closest<HTMLElement>(".mermaid-block-wrapper");
      if (!wrapper) {
        return;
      }
      const preview = wrapper.querySelector<HTMLElement>(".mermaid");
      const raw = wrapper.querySelector<HTMLElement>(".mermaid-raw");
      const isRaw = !wrapper.classList.contains("is-raw");
      wrapper.classList.toggle("is-raw", isRaw);
      button.setAttribute("aria-pressed", String(isRaw));
      if (preview) {
        preview.hidden = isRaw;
        preview.setAttribute("aria-hidden", String(isRaw));
      }
      if (raw) {
        raw.hidden = !isRaw;
        raw.setAttribute("aria-hidden", String(!isRaw));
      }
    });
  }
}
