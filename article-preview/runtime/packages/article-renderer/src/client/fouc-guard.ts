/**
 * Pre-paint FOUC guard shared by the web page shell and the CLI's standalone
 * HTML. Must execute as a classic script before first paint, so it is exported
 * as a plain-JS string (no TS syntax) rather than a function — consumers embed
 * it directly inside a <script> tag in <head>.
 *
 * With no saved choice, a light OS preference selects "snow"; otherwise the
 * markup default ("obsidian") stands. A saved choice always wins.
 */

export const FOUC_GUARD_SCRIPT = `(function() {
  var t = localStorage.getItem("theme");
  if (!t && window.matchMedia("(prefers-color-scheme: light)").matches) t = "snow";
  if (t) document.documentElement.dataset.theme = t;
})();`;
