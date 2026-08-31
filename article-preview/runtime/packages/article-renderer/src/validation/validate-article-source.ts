import type { Root } from "mdast";
import { parseMdx } from "../mdx-parse.js";
import { checkComponents } from "./rules/component.js";
import { checkHeadings } from "./rules/heading.js";
import { checkMedia } from "./rules/media.js";
import { checkCjkSpacing } from "./rules/spacing.js";
import { createSharedIssue, type ValidationIssue } from "./types.js";

/**
 * A prohibition a renderer adds on top of the shared ones, given the parsed
 * article. What the web requires in order to publish is written this way and
 * lives in the web app, so this package holds only what both renderers can
 * demand of any document.
 */
export type ArticleRule = (tree: Root) => ValidationIssue[];

/**
 * Reports every prohibition the MDX source violates, in source order.
 *
 * The whole source goes in and the whole verdict comes out, so the web build,
 * the `just` recipe and the CLI all reach the same judgement from one
 * implementation. Nothing here throws: a caller decides what a violation costs.
 *
 * `additionalRules` is passed rather than defaulted, so that a caller states
 * whether it has prohibitions of its own instead of silently inheriting none.
 */
export function validateArticleSource(
  source: string,
  additionalRules: ArticleRule[],
): ValidationIssue[] {
  let tree: ReturnType<typeof parseMdx>;
  try {
    tree = parseMdx(source);
  } catch (error) {
    const parseError = error as { message?: string; line?: number; column?: number };
    return [
      createSharedIssue(
        "MdxParseError",
        `MDX failed to parse: ${parseError.message ?? String(error)}`,
        { line: parseError.line ?? 1, column: parseError.column ?? 1 },
        parseError.message ?? String(error),
      ),
    ];
  }

  const issues = [
    ...checkCjkSpacing(source),
    ...checkHeadings(tree),
    ...checkComponents(tree),
    ...checkMedia(tree),
    ...additionalRules.flatMap((rule) => rule(tree)),
  ];

  return issues.sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    if (left.column !== right.column) {
      return left.column - right.column;
    }
    return left.rule.localeCompare(right.rule);
  });
}

export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
