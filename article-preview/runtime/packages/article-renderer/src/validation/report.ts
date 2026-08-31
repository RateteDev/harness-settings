import type { ValidationIssue } from "./types.js";

/**
 * Lays the issues of one file out for a terminal: the path once, then a line
 * per issue whose position is the first thing on it, so it stays greppable and
 * an editor can open it.
 *
 * It lives here because more than one command reports articles — the CLI and
 * the web app's own checker — and a reader comparing their output should not
 * have to work out whether two layouts mean the same thing.
 */
export function formatIssues(filePath: string, issues: ValidationIssue[]): string {
  const positions = issues.map((issue) => `${issue.line}:${issue.column}`);
  const width = Math.max(...positions.map((position) => position.length));

  const lines = issues.map((issue, index) => {
    const position = (positions[index] ?? "").padEnd(width);
    return `  ${position}  ${issue.severity.padEnd(7)}  ${issue.rule}: ${issue.message}`;
  });

  return [filePath, ...lines].join("\n");
}

export function summariseIssues(issues: ValidationIssue[], fileCount: number): string {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return `${errors} error(s), ${warnings} warning(s) across ${fileCount} file(s)`;
}
