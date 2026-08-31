import { createMermaidRenderer } from "mermaid-isomorphic";
import { mermaidConfig } from "./mermaid-theme.js";

/**
 * Renders Mermaid sources to inline SVG strings, aligned by input index.
 * Rendering happens at build time via a headless browser; no Mermaid runtime is
 * shipped to the client. Tests inject a stub to avoid launching a browser.
 */
export type MermaidRenderFn = (sources: string[]) => Promise<string[]>;

const renderer = createMermaidRenderer();

/**
 * Default headless-browser renderer. `fontCssUrl` is a `data:text/css` URL
 * embedding the display font so measurement matches the rendered page. A
 * rejected diagram throws: standalone HTML must not silently fall back.
 */
export function createDefaultMermaidRender(fontCssUrl: string): MermaidRenderFn {
  return async (sources) => {
    const results = await renderer(sources, { mermaidConfig, css: fontCssUrl });
    return results.map((result) => {
      if (result.status === "fulfilled") {
        return result.value.svg;
      }
      throw result.reason;
    });
  };
}
