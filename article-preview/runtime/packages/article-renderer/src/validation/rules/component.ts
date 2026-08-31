import type { Root } from "mdast";
import {
  ALLOWED_MDX_COMPONENTS,
  extractCodeGroupLabels,
  type MdxJsxAttributeLike,
} from "../../mdx-components.js";
import { createSharedIssue, type ValidationIssue } from "../types.js";
import { isJsx, positionOf, type UnistLike, walk } from "../walk.js";

const allowedComponents = new Set<string>(ALLOWED_MDX_COMPONENTS);

const ANONYMOUS_COMPONENT = "(anonymous)";

function componentName(node: UnistLike): string {
  return (node as { name?: string | null }).name ?? ANONYMOUS_COMPONENT;
}

export function checkComponents(tree: Root): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  walk(tree as unknown as UnistLike, (node) => {
    if (node.type === "mdxjsEsm") {
      const value = (node as { value?: string }).value ?? "";
      issues.push(
        createSharedIssue(
          "EsmStatement",
          "MDX must not carry module statements. Components are resolved by the renderer, so an import or an export here is dropped rather than executed. Delete the line.",
          positionOf(node),
          value,
        ),
      );
      return;
    }

    if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
      const value = (node as { value?: string }).value ?? "";
      issues.push(
        createSharedIssue(
          "JsExpression",
          `MDX must not contain the JavaScript expression "{${value}}". Articles are rendered ahead of time and carry no runtime evaluation. Write the value out.`,
          positionOf(node),
          `{${value}}`,
        ),
      );
      return;
    }

    if (isJsx(node)) {
      const name = componentName(node);
      if (!allowedComponents.has(name)) {
        issues.push(
          createSharedIssue(
            "UnknownComponent",
            `<${name}> has no implementation. Only ${ALLOWED_MDX_COMPONENTS.join(", ")} render on both the web and the CLI. Register it in ALLOWED_MDX_COMPONENTS and implement it on both renderers to use it.`,
            positionOf(node),
            `<${name}>`,
          ),
        );
        return;
      }

      if (name === "CodeGroup") {
        const attributes = (node as { attributes?: MdxJsxAttributeLike[] }).attributes;
        if (extractCodeGroupLabels(attributes) === null) {
          issues.push(
            createSharedIssue(
              "NonLiteralCodeGroupLabels",
              'The labels of <CodeGroup> are read off the syntax tree, so they must be a string-array literal. Write labels={["npm", "yarn"]}.',
              positionOf(node),
              "<CodeGroup>",
            ),
          );
        }
        return;
      }
    }
  });

  return issues;
}
