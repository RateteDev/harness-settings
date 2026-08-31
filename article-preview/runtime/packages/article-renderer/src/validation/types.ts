/**
 * Whether a violation blocks publication.
 *
 * "error" stops the build and the CLI. "warning" is reported and lets the
 * article through, for rules that discourage a form without forbidding it.
 */
export type ValidationSeverity = "error" | "warning";

/** One rule per prohibition both renderers share. */
export type ValidationRule =
  | "MdxParseError"
  | "CjkLatinSpacing"
  | "HeadingContainsSpace"
  | "DuplicateHeadingText"
  | "MultipleH1"
  | "HeadingTooDeep"
  | "UnknownComponent"
  | "EsmStatement"
  | "JsExpression"
  | "NonLiteralCodeGroupLabels"
  | "MediaUnknownAttribute"
  | "MediaNonLiteralAttribute"
  | "MediaMissingSource"
  | "MediaInvalidRatio"
  | "MarkdownVideoSource";

/**
 * The severity of every shared rule, declared in one place so that relaxing a
 * rule to a warning is a single-line change and no call site carries its own
 * opinion. A renderer that adds prohibitions of its own keeps its own table.
 */
export const RULE_SEVERITY: Record<ValidationRule, ValidationSeverity> = {
  MdxParseError: "error",
  CjkLatinSpacing: "error",
  HeadingContainsSpace: "error",
  DuplicateHeadingText: "error",
  MultipleH1: "error",
  HeadingTooDeep: "error",
  UnknownComponent: "error",
  EsmStatement: "error",
  JsExpression: "error",
  NonLiteralCodeGroupLabels: "error",
  MediaUnknownAttribute: "error",
  MediaNonLiteralAttribute: "error",
  MediaMissingSource: "error",
  MediaInvalidRatio: "error",
  MarkdownVideoSource: "error",
};

export interface ValidationIssue {
  /**
   * The rule's name. It is a plain string rather than the union above because a
   * renderer may forbid more than the two of them share: what the web requires
   * to publish is the web's own rule, and it is reported here alongside these.
   */
  rule: string;
  severity: ValidationSeverity;
  /** English, and specific enough to identify the offending place on its own. */
  message: string;
  /** 1-based position in the MDX source. */
  line: number;
  column: number;
  /** The offending source text, truncated to {@link EXCERPT_MAX_LENGTH}. */
  excerpt: string;
}

export const EXCERPT_MAX_LENGTH = 80;

export function truncateExcerpt(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= EXCERPT_MAX_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, EXCERPT_MAX_LENGTH - 1)}…`;
}

/**
 * Builds one issue. Callers outside this package use it for their own rules,
 * which is why the severity is passed rather than looked up: their table is
 * theirs to keep.
 */
export function createIssue(
  rule: string,
  severity: ValidationSeverity,
  message: string,
  position: { line: number; column: number },
  excerpt: string,
): ValidationIssue {
  return {
    rule,
    severity,
    message,
    line: position.line,
    column: position.column,
    excerpt: truncateExcerpt(excerpt),
  };
}

/** The same, for the shared rules, whose severity this module already holds. */
export function createSharedIssue(
  rule: ValidationRule,
  message: string,
  position: { line: number; column: number },
  excerpt: string,
): ValidationIssue {
  return createIssue(rule, RULE_SEVERITY[rule], message, position, excerpt);
}
