#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostic, MediaMode } from "@ratete/article-renderer";
import { renderFullHtml, stripCjkSpaces } from "@ratete/article-renderer";
import { parseFrontmatter, validateFrontmatter } from "@ratete/article-renderer/frontmatter";
import type { ValidationIssue } from "@ratete/article-renderer/validation";
import {
  createIssue,
  formatIssues,
  hasValidationErrors,
  summariseIssues,
  validateArticleSource,
} from "@ratete/article-renderer/validation";
// The CLI ships on its own, so it carries its own copy of the stylesheet rather
// than reading one out of the shared package. `just assets-sync` writes it.
import ARTICLE_CSS from "./styles/generated/article.css" with { type: "text" };

/**
 * How media is answered unless `--media` says otherwise. Inline is the default
 * because the output is made to be handed to someone: it opens with no access
 * to wherever the originals live.
 */
const DEFAULT_MEDIA_MODE: MediaMode = "inline";
const MEDIA_MODES: MediaMode[] = ["inline", "link"];

/**
 * Bundles the canonical client interactions entry (`@ratete/article-renderer/client-entry`)
 * into a single dependency-free classic script for embedding in standalone HTML.
 * The entry module has side effects only (no exports), so the bundled output
 * contains no `import`/`export` statements.
 */
async function buildInteractionsScript(): Promise<string> {
  const entry = fileURLToPath(import.meta.resolve("@ratete/article-renderer/client-entry"));
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: false,
  });

  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Failed to bundle interactions script:\n${messages}`);
  }

  const [artifact] = result.outputs;
  if (!artifact) {
    throw new Error("Failed to bundle interactions script: no output produced");
  }

  return await artifact.text();
}

function printUsage(): void {
  process.stderr.write(
    "Usage: article-preview <input.mdx> [--out <output.html>] [--media <inline|link>]\n",
  );
  process.stderr.write("       article-preview fix-spacing <file.mdx> [...files]\n");
  process.stderr.write("       article-preview validate <file.mdx> [...files]\n");
  process.stderr.write("  --out <path>        Output file path (default: stdout)\n");
  process.stderr.write(
    `  --media <mode>      inline embeds every image and video as a data URI; link keeps the URLs as written and fails on a local path (default: ${DEFAULT_MEDIA_MODE})\n`,
  );
  process.stderr.write("\nThe output is a self-contained standalone HTML.\n");
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const d of diagnostics) {
    process.stderr.write(`[${d.level.toUpperCase()}] ${d.message}\n`);
  }
}

function runFixSpacing(files: string[]): void {
  if (files.length === 0) {
    process.stderr.write("Error: fix-spacing requires at least one file path\n");
    process.exit(1);
  }

  let hasError = false;
  for (const filePath of files) {
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch (err) {
      process.stderr.write(`Error: failed to read "${filePath}": ${String(err)}\n`);
      hasError = true;
      continue;
    }

    const result = stripCjkSpaces(source);
    if (result !== source) {
      try {
        writeFileSync(filePath, result, "utf-8");
        process.stderr.write(`Modified: ${filePath}\n`);
      } catch (err) {
        process.stderr.write(`Error: failed to write "${filePath}": ${String(err)}\n`);
        hasError = true;
      }
    } else {
      process.stderr.write(`Unchanged: ${filePath}\n`);
    }
  }

  process.exit(hasError ? 1 : 0);
}

/**
 * Checks the frontmatter against the shared specification. A document is
 * expected to be brought to that specification before it is opened, so a key
 * outside it is a warning — the converter should hear about it, but the output
 * is still worth producing — while a malformed value on a specified field is
 * an error the conversion has to fix.
 */
function frontmatterIssues(source: string): ValidationIssue[] {
  const { frontmatter: raw } = parseFrontmatter(source);
  try {
    const { unknownKeys } = validateFrontmatter(raw);
    return unknownKeys.map((key) =>
      createIssue(
        "FrontmatterUnknownKey",
        "warning",
        `Frontmatter key "${key}" is outside the specification and is ignored.`,
        { line: 1, column: 1 },
        key,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [createIssue("FrontmatterInvalid", "error", message, { line: 1, column: 1 }, message)];
  }
}

/**
 * Checks one article and writes what it found to the terminal. The renderer
 * itself validates nothing, so every command that reads an article calls this
 * before doing anything with it.
 */
function reportIssues(filePath: string, source: string): ValidationIssue[] {
  // Body rules: none of the CLI's own — a document is judged only by what the
  // renderer is able to draw. The frontmatter is judged against the shared
  // specification, ahead of rendering so a warning is read before the output.
  const issues = [...frontmatterIssues(source), ...validateArticleSource(source, [])];
  if (issues.length > 0) {
    process.stderr.write(`${formatIssues(filePath, issues)}\n`);
  }
  return issues;
}

/**
 * Reports every prohibition the given articles violate. Exits non-zero when any
 * of them is an error, so a build or a CI step can stand on this command.
 */
function runValidate(files: string[]): void {
  if (files.length === 0) {
    process.stderr.write("Error: validate requires at least one file path\n");
    process.exit(1);
  }

  let unreadable = false;
  const found: ValidationIssue[] = [];

  for (const filePath of files) {
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch (err) {
      process.stderr.write(`Error: failed to read "${filePath}": ${String(err)}\n`);
      unreadable = true;
      continue;
    }

    found.push(...reportIssues(filePath, source));
  }

  if (found.length > 0) {
    process.stderr.write(`${summariseIssues(found, files.length)}\n`);
  }

  process.exit(unreadable || hasValidationErrors(found) ? 1 : 0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  if (args[0] === "fix-spacing") {
    runFixSpacing(args.slice(1));
    return;
  }

  if (args[0] === "validate") {
    runValidate(args.slice(1));
    return;
  }

  const inputPath = args[0];
  if (!inputPath || inputPath.startsWith("--")) {
    process.stderr.write("Error: input file path is required as the first argument\n");
    printUsage();
    process.exit(1);
  }

  let outPath: string | null = null;
  let mediaMode: MediaMode = DEFAULT_MEDIA_MODE;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out") {
      outPath = args[++i] ?? null;
    } else if (arg === "--media") {
      const value = args[++i];
      if (!MEDIA_MODES.includes(value as MediaMode)) {
        process.stderr.write(
          `Error: --media takes ${MEDIA_MODES.join(" or ")}, got "${value ?? ""}"\n`,
        );
        printUsage();
        process.exit(1);
      }
      mediaMode = value as MediaMode;
    } else {
      process.stderr.write(`Error: unknown argument "${arg}"\n`);
      printUsage();
      process.exit(1);
    }
  }

  let source: string;
  try {
    source = readFileSync(inputPath, "utf-8");
  } catch (err) {
    process.stderr.write(`Error: failed to read input file "${inputPath}": ${String(err)}\n`);
    process.exit(1);
  }

  const issues = reportIssues(inputPath, source);
  if (hasValidationErrors(issues)) {
    process.stderr.write(`${summariseIssues(issues, 1)}\n`);
    process.exit(1);
  }

  let interactionsScript: string;
  try {
    interactionsScript = await buildInteractionsScript();
  } catch (err) {
    process.stderr.write(`Error: ${String(err)}\n`);
    process.exit(1);
  }

  let result: Awaited<ReturnType<typeof renderFullHtml>>;
  try {
    result = await renderFullHtml(source, {
      interactionsScript,
      css: ARTICLE_CSS,
      media: {
        mode: mediaMode,
        // Relative references belong to the document, so they are resolved from
        // where it sits rather than from where the command was run.
        baseDir: dirname(inputPath),
        warn: (message) => process.stderr.write(`[WARNING] ${message}\n`),
      },
    });
  } catch (err) {
    process.stderr.write(`Error: render failed: ${String(err)}\n`);
    process.exit(1);
  }

  if (result.diagnostics.length > 0) {
    printDiagnostics(result.diagnostics);
  }

  if (outPath) {
    try {
      writeFileSync(outPath, result.html, "utf-8");
      process.stderr.write(`Written: ${outPath}\n`);
    } catch (err) {
      process.stderr.write(`Error: failed to write output file "${outPath}": ${String(err)}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write(result.html);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
