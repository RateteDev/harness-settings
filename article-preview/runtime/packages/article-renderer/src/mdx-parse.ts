import * as acorn from "acorn";
import type { Root } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * The single mdast parser configuration for article MDX. Validation and
 * rendering both read the tree this produces, so a rule that fires during
 * validation describes the same tree the renderer will walk.
 */
export function parseMdx(source: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMdx, { acorn, acornOptions: { ecmaVersion: 2022, sourceType: "module" } });

  return processor.parse(source) as Root;
}
