import { createHighlighter } from "shiki";
import type { Highlighter } from "./render-context.js";
import { tuiConsoleTheme } from "./tui-console-theme.js";

let _highlighterPromise: Promise<Highlighter> | null = null;

export async function getHighlighter(): Promise<Highlighter> {
  if (!_highlighterPromise) {
    _highlighterPromise = createHighlighter({
      themes: [tuiConsoleTheme],
      langs: [
        "javascript",
        "typescript",
        "json",
        "bash",
        "sh",
        "css",
        "html",
        "markdown",
        "text",
        "mdx",
        "python",
        "rust",
        "go",
        "yaml",
        "toml",
      ],
    });
  }
  return _highlighterPromise;
}
