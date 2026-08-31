/**
 * Client controls for the site header: popover open/close and the color theme
 * selector (localStorage key "theme", default "obsidian"). Source of truth for
 * both the web app and the CLI's standalone HTML.
 *
 * The popovers follow the ARIA menu pattern: the trigger owns `aria-expanded`,
 * options are `menuitemradio` with `aria-checked`, opening moves focus to the
 * checked option, arrow keys / Home / End roam, and Escape closes and returns
 * focus to the trigger. Idempotency guards follow the dataset-flag pattern —
 * per-trigger/per-button flags, plus a document-level flag for the global
 * click/keydown listeners.
 */

const MENU_ITEM_SELECTOR = '[role="menuitemradio"]';

function closeAllPopovers(restoreFocus = false): void {
  for (const p of document.querySelectorAll<HTMLElement>("[data-popover]")) {
    const wasOpen = p.classList.contains("open");
    p.classList.remove("open");
    const btn = p.previousElementSibling as HTMLElement | null;
    btn?.setAttribute("aria-expanded", "false");
    if (wasOpen && restoreFocus && btn && p.contains(document.activeElement)) {
      btn.focus();
    }
  }
}

function markSelected(
  buttons: Iterable<HTMLButtonElement>,
  checkClass: string,
  isSelected: (btn: HTMLButtonElement) => boolean,
): void {
  for (const btn of buttons) {
    const selected = isSelected(btn);
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-checked", selected ? "true" : "false");
    const check = btn.querySelector(checkClass);
    if (check) check.textContent = selected ? "✓" : "";
  }
}

/**
 * Keeps the browser chrome tint in step with the active theme. The markup can
 * only carry one value, so it holds the default theme's and any other theme
 * left the address bar and PWA chrome painted for the wrong background. The
 * colour is read back from the page rather than listed here, so the two cannot
 * drift.
 */
function syncThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) meta.content = bg;
}

function updateThemeUI(theme: string): void {
  markSelected(
    document.querySelectorAll<HTMLButtonElement>("[data-theme-value]"),
    ".theme-option-check",
    (btn) => btn.dataset.themeValue === theme,
  );
  syncThemeColor();
}

function menuItems(popover: HTMLElement): HTMLButtonElement[] {
  return Array.from(popover.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR));
}

function focusMenuItem(popover: HTMLElement, index: number): void {
  const items = menuItems(popover);
  if (items.length === 0) return;
  const wrapped = (index + items.length) % items.length;
  items[wrapped]?.focus();
}

function openPopover(btn: HTMLElement, popover: HTMLElement): void {
  closeAllPopovers();
  popover.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  const items = menuItems(popover);
  const checked = items.findIndex((item) => item.getAttribute("aria-checked") === "true");
  focusMenuItem(popover, checked === -1 ? 0 : checked);
}

function handleMenuKeydown(e: KeyboardEvent, popover: HTMLElement): void {
  const items = menuItems(popover);
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  switch (e.key) {
    case "ArrowDown":
      focusMenuItem(popover, current + 1);
      break;
    case "ArrowUp":
      focusMenuItem(popover, current - 1);
      break;
    case "Home":
      focusMenuItem(popover, 0);
      break;
    case "End":
      focusMenuItem(popover, items.length - 1);
      break;
    case "Tab":
      closeAllPopovers();
      return;
    default:
      return;
  }
  e.preventDefault();
}

/** Wire popover open/close for the header's icon buttons. */
export function initPopovers(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-popover-trigger]")) {
    if (btn.dataset.popoverBound === "1") continue;
    btn.dataset.popoverBound = "1";

    const popover = btn.nextElementSibling as HTMLElement | null;
    if (!popover) continue;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (popover.classList.contains("open")) {
        closeAllPopovers();
      } else {
        openPopover(btn, popover);
      }
    });

    // ArrowDown on a closed trigger opens the menu, mirroring a native menu button.
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && !popover.classList.contains("open")) {
        e.preventDefault();
        openPopover(btn, popover);
      }
    });

    popover.addEventListener("keydown", (e) => handleMenuKeydown(e, popover));
  }

  if (document.documentElement.dataset.popoverGlobalBound === "1") return;
  document.documentElement.dataset.popoverGlobalBound = "1";

  document.addEventListener("click", (e) => {
    if (!(e.target as Element).closest(".popover-anchor")) {
      closeAllPopovers();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllPopovers(true);
  });
}

/** Wire the color theme selector popover. */
export function initTheme(): void {
  const current = document.documentElement.dataset.theme || "obsidian";
  updateThemeUI(current);

  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-theme-value]")) {
    if (btn.dataset.themeBound === "1") continue;
    btn.dataset.themeBound = "1";
    btn.addEventListener("click", () => {
      const theme = btn.dataset.themeValue;
      if (!theme) return;
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("theme", theme);
      updateThemeUI(theme);
      closeAllPopovers(true);
    });
  }
}
