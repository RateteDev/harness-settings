import type { Root } from "mdast";
import { createSharedIssue, type ValidationIssue } from "../types.js";
import { isHeading, positionOf, textOf, type UnistLike, walk } from "../walk.js";

/**
 * A heading's id is derived from its text, so whitespace in a heading is not
 * cosmetic: it decides the anchor other people share. Every space becomes a
 * hyphen, some forms collapse or vanish, and the author has no way to see which
 * happened. Rather than pick which of those are acceptable, headings carry no
 * whitespace at all — the site's headings are Japanese, where a space is
 * already a typographic defect, and an English compound can be hyphenated.
 */
const HEADING_WHITESPACE = /\s/;

/** The deepest heading level the table of contents and the layout support. */
const MAX_HEADING_DEPTH = 3;

export function checkHeadings(tree: Root): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenText = new Set<string>();
  let h1Count = 0;

  walk(tree as unknown as UnistLike, (node) => {
    if (!isHeading(node, [1, 2, 3, 4, 5, 6])) {
      return;
    }
    const depth = (node as { depth: number }).depth;
    const text = textOf(node);
    const position = positionOf(node);

    if (depth === 1) {
      h1Count += 1;
      if (h1Count > 1) {
        issues.push(
          createSharedIssue(
            "MultipleH1",
            `Heading "${text}" is a second h1. Only the first h1 becomes the article title; the rest stay in the body without an id or a table-of-contents entry. Demote it to h2.`,
            position,
            text,
          ),
        );
      }
      return;
    }

    if (depth > MAX_HEADING_DEPTH) {
      issues.push(
        createSharedIssue(
          "HeadingTooDeep",
          `Heading "${text}" is h${depth}. The article hierarchy stops at h${MAX_HEADING_DEPTH}, and deeper headings never reach the table of contents. Promote it or split the section.`,
          position,
          text,
        ),
      );
    }

    if (HEADING_WHITESPACE.test(text)) {
      issues.push(
        createSharedIssue(
          "HeadingContainsSpace",
          `Heading "${text}" contains whitespace, which would appear in its anchor as a hyphen. Rewrite the heading without it: use ":" as a separator and hyphenate English compounds.`,
          position,
          text,
        ),
      );
    }

    if (seenText.has(text)) {
      issues.push(
        createSharedIssue(
          "DuplicateHeadingText",
          `Heading "${text}" repeats an earlier heading. The second one silently gets "-1" appended to its id, so neither anchor can be told apart. Reword one of them.`,
          position,
          text,
        ),
      );
    }
    seenText.add(text);
  });

  return issues;
}
