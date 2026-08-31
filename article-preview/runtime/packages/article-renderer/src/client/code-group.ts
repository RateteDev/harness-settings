/**
 * Client controls for `.code-group` tabbed code blocks: tab bar construction, tab
 * switching with cross-group sync by label, copy-to-clipboard, and word-wrap toggle.
 * Ported from apps/web/src/components/article-parts/parts/code-group.astro.
 */

import { copyText } from "./clipboard";

const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const WRAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><path d="M3 18h7"/></svg>`;

const STORAGE_KEY = "code-group-selected";

function getStoredPreferences(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function storePreference(label: string): void {
  const prefs = getStoredPreferences();
  prefs._last = label;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function extractText(pre: HTMLElement): string {
  return pre.querySelector("code")?.innerText ?? pre.innerText ?? "";
}

/**
 * Parse a group's `data-labels` JSON array.
 * Safety fix vs. the web original: wrapped in try/catch so malformed data-labels
 * cannot throw (the web original parsed this unguarded inside `syncGroups`).
 */
function parseLabels(group: HTMLElement): string[] {
  try {
    return JSON.parse(group.dataset.labels ?? "[]");
  } catch {
    return [];
  }
}

function activateTab(group: HTMLElement, pres: NodeListOf<HTMLElement>, idx: number): void {
  const tabs = group.querySelectorAll<HTMLElement>(".code-group-tab");
  for (const tab of tabs) {
    tab.classList.toggle("is-active", Number(tab.dataset.index) === idx);
  }
  for (let i = 0; i < pres.length; i++) {
    (pres[i] as HTMLElement).style.display = i === idx ? "" : "none";
  }
  const copyBtn = group.querySelector<HTMLButtonElement>(".code-group-actions .code-group-copy");
  if (copyBtn) {
    copyBtn.dataset.source = extractText(pres[idx] as HTMLElement);
  }
}

function syncGroups(label: string, origin: HTMLElement): void {
  const allGroups = document.querySelectorAll<HTMLElement>(".code-group");
  for (const g of allGroups) {
    if (g === origin) continue;
    const labels = parseLabels(g);
    const idx = labels.indexOf(label);
    if (idx !== -1) {
      const pres = g.querySelectorAll<HTMLElement>(":scope > pre");
      activateTab(g, pres, idx);
    }
  }
}

/** Build tab bars for every `.code-group` and wire tab switching, copy, and wrap toggle. */
export function initCodeGroups(): void {
  const groups = document.querySelectorAll<HTMLElement>(".code-group");
  const prefs = getStoredPreferences();

  for (const group of groups) {
    if (group.dataset.cgBound === "1") continue;
    group.dataset.cgBound = "1";

    const labels = parseLabels(group);
    const pres = group.querySelectorAll<HTMLElement>(":scope > pre");
    if (labels.length === 0 || pres.length === 0) continue;

    const tabBar = document.createElement("div");
    tabBar.className = "code-group-tabs";

    for (let i = 0; i < labels.length; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-group-tab";
      btn.textContent = labels[i] ?? "";
      btn.dataset.index = String(i);
      if (i === 0) btn.classList.add("is-active");
      tabBar.appendChild(btn);
    }

    const actions = document.createElement("div");
    actions.className = "code-group-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "code-group-copy";
    copyBtn.setAttribute("aria-label", "Copy code");
    copyBtn.innerHTML = COPY_SVG;
    copyBtn.dataset.source = extractText(pres[0] as HTMLElement);
    copyBtn.addEventListener("click", async () => {
      const source = copyBtn.dataset.source ?? "";
      try {
        await copyText(source);
        copyBtn.classList.add("is-copied");
        window.setTimeout(() => copyBtn.classList.remove("is-copied"), 1500);
      } catch (err) {
        console.error("[code-group] copy failed", err);
      }
    });

    const wrapBtn = document.createElement("button");
    wrapBtn.type = "button";
    wrapBtn.className = "code-group-wrap-toggle";
    wrapBtn.setAttribute("aria-label", "Toggle word wrap");
    wrapBtn.innerHTML = WRAP_SVG;
    wrapBtn.addEventListener("click", () => {
      group.classList.toggle("is-wrapped");
    });

    actions.appendChild(copyBtn);
    actions.appendChild(wrapBtn);
    tabBar.appendChild(actions);

    group.insertBefore(tabBar, group.firstChild);

    const defaultIdx = prefs._last ? Math.max(labels.indexOf(prefs._last), 0) : 0;
    activateTab(group, pres, defaultIdx);

    tabBar.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("code-group-tab")) return;
      const idx = Number(target.dataset.index);
      activateTab(group, pres, idx);
      const label = labels[idx];
      if (label) {
        storePreference(label);
        syncGroups(label, group);
      }
    });
  }
}
