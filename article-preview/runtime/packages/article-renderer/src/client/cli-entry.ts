/**
 * Bundling entry point for the CLI's embedded classic script. Has side effects at
 * module top level (no exports) — this module is the direct replacement for the
 * legacy `INTERACTIONS_SCRIPT` string in scripts.ts, bundled via `bun build`.
 */

import { initCodeCopy, initCollapseToggle, initWrapToggle } from "./code-block";
import { initCodeGroups } from "./code-group";
import { initPopovers, initTheme } from "./header";
import { initHeadingLinks } from "./heading-link";
import { initMermaidCopy, initMermaidViewToggle } from "./mermaid";
import { initToc } from "./toc";

function initAll(): void {
  initCodeCopy();
  initWrapToggle();
  initCollapseToggle();
  initMermaidCopy();
  initMermaidViewToggle();
  initCodeGroups();
  initHeadingLinks();
  initToc();
  initPopovers();
  initTheme();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAll);
} else {
  initAll();
}
