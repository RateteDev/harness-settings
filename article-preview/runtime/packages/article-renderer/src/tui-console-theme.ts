import type { ThemeRegistrationRaw } from "shiki";

/**
 * Portable copy of the web app's Shiki theme.
 *
 * Source of truth: `apps/web/astro.config.mjs` (`syntax` / `consoleTheme`).
 * Keep these values byte-identical to the web config so CLI output matches the
 * site. VS Code Dark+ based; comments use green per author preference.
 */
const syntax = {
  fg: "#D4D4D4",
  bg: "#0a0a0a",
  gutter: "#777777",
  comment: "#6A9955",
  keyword: "#569CD6",
  string: "#CE9178",
  func: "#DCDCAA",
  type: "#4EC9B0",
  property: "#9CDCFE",
  variable: "#9CDCFE",
};

export const tuiConsoleTheme: ThemeRegistrationRaw = {
  name: "tui-console",
  colors: {
    "editor.background": syntax.bg,
    "editor.foreground": syntax.gutter,
  },
  settings: [
    { settings: { foreground: syntax.fg } },
    {
      scope: ["comment", "comment.line", "comment.block", "punctuation.definition.comment"],
      settings: { foreground: syntax.comment },
    },
    {
      scope: ["keyword", "storage.type", "storage.modifier"],
      settings: { foreground: syntax.keyword },
    },
    {
      scope: ["string", "string.quoted.double", "constant.numeric", "constant.language"],
      settings: { foreground: syntax.string },
    },
    {
      scope: ["entity.name.function", "support.function"],
      settings: { foreground: syntax.func },
    },
    {
      scope: ["entity.name.type", "support.type", "entity.other.inherited-class"],
      settings: { foreground: syntax.type },
    },
    {
      scope: ["variable", "variable.other", "variable.parameter"],
      settings: { foreground: syntax.variable },
    },
    {
      scope: ["support.type.property-name", "meta.object-literal.key"],
      settings: { foreground: syntax.property },
    },
    {
      scope: ["punctuation", "meta.structure.dictionary.json punctuation"],
      settings: { foreground: syntax.fg },
    },
  ],
};
