import { stripCjkSpaces } from "../../strip-cjk-spaces.js";
import { createSharedIssue, type ValidationIssue } from "../types.js";

function firstDifferingColumn(before: string, after: string): number {
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] !== after[index]) {
      return index + 1;
    }
  }
  return 1;
}

/**
 * Rejects the spaces {@link stripCjkSpaces} would remove.
 *
 * The renderers used to strip these while converting, which left the article
 * source and the published text saying different things — and a heading's
 * anchor is derived from that text, so the author could not read an anchor off
 * their own heading. Judgement and repair now come from the same function: what
 * this rejects is exactly what `article-preview fix-spacing` rewrites.
 */
export function checkCjkSpacing(source: string): ValidationIssue[] {
  const stripped = stripCjkSpaces(source);
  if (stripped === source) {
    return [];
  }

  const before = source.split("\n");
  const after = stripped.split("\n");
  const issues: ValidationIssue[] = [];

  for (let index = 0; index < before.length; index += 1) {
    if (before[index] === after[index]) {
      continue;
    }
    issues.push(
      createSharedIssue(
        "CjkLatinSpacing",
        'Unnecessary space between CJK and Latin text. The rendered article would not match its source. Run "article-preview fix-spacing" to rewrite this line.',
        { line: index + 1, column: firstDifferingColumn(before[index], after[index]) },
        before[index],
      ),
    );
  }

  return issues;
}
