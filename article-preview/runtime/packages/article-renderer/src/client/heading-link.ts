/**
 * Client control for the "copy heading link" button rendered next to each h2.
 * Source of truth for both the web app and the CLI's standalone HTML.
 *
 * Each button carries an idempotency guard via a dataset flag, and the copy
 * call is routed through the shared copyText helper inside try/catch.
 */

import { copyText } from "./clipboard";

const RESET_MS = 1500;

/** Wire the copy-heading-link button next to each h2. */
export function initHeadingLinks(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".heading-link")) {
    if (btn.dataset.linkBound === "1") continue;
    btn.dataset.linkBound = "1";
    btn.addEventListener("click", async () => {
      const h2 = btn.closest("h2");
      const id = h2?.id;
      if (!id) return;
      const url = `${location.origin}${location.pathname}#${id}`;
      try {
        await copyText(url);
        btn.classList.add("copied");
        window.setTimeout(() => btn.classList.remove("copied"), RESET_MS);
      } catch (error) {
        console.error("[heading-link] copy failed", error);
      }
    });
  }
}
