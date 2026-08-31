/**
 * Canonical client-side interaction scripts for rendered articles.
 * Single re-export surface for both web (Astro components) and the CLI's
 * bundled classic-script entry (see ./cli-entry.ts).
 */

export { copyPng, copyText } from "./clipboard";
export { initCodeCopy, initCollapseToggle, initWrapToggle } from "./code-block";
export { initCodeGroups } from "./code-group";
export { FOUC_GUARD_SCRIPT } from "./fouc-guard";
export { initPopovers, initTheme } from "./header";
export { initHeadingLinks } from "./heading-link";
export { initMermaidCopy, initMermaidViewToggle } from "./mermaid";
export { initToc } from "./toc";
