/**
 * The theme picker's markup, in the one place both delivery forms take it from.
 *
 * The client script in client/header.ts drives this markup through the data
 * attributes and ARIA roles written here, and it is shared by both forms; the
 * three only stay in step because there is one copy of the markup.
 *
 * The web app does not import this module. The sync script writes the markup
 * out as an Astro component and the web app uses that copy, so its build stays
 * independent of the script having been run — the same arrangement the shared
 * stylesheets have.
 */

import { themeIconString, withSvgClass } from "./icons.js";

/** The themes offered, in the order the menu lists them. */
const THEMES = [
  { value: "snow", label: "Snow" },
  { value: "obsidian", label: "Obsidian" },
] as const;

function themeOption(value: string, label: string): string {
  return `    <button class="theme-option" role="menuitemradio" aria-checked="false" data-theme-value="${value}">
      <span class="theme-swatch">
        <span class="theme-swatch-bg"></span>
        <span class="theme-swatch-accent"></span>
      </span>
      <span class="theme-option-label">${label}</span>
      <span class="theme-option-check" aria-hidden="true"></span>
    </button>`;
}

const THEME_OPTIONS = THEMES.map((theme) => themeOption(theme.value, theme.label)).join("\n");

export const THEME_PICKER_HTML = `<div class="popover-anchor">
  <button
    class="icon-btn"
    type="button"
    aria-label="カラーテーマの変更"
    aria-expanded="false"
    aria-haspopup="true"
    data-popover-trigger
  >
    ${withSvgClass(themeIconString, "icon")}
    <span class="theme-indicator"></span>
  </button>
  <div class="popover theme-popover" data-popover role="menu" aria-label="カラーテーマ">
${THEME_OPTIONS}
  </div>
</div>
`;
