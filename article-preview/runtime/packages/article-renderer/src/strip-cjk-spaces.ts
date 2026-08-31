const CJK = "[\\u3400-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u309F\\u30A0-\\u30FF]";
const ALNUM = "[A-Za-z0-9]";
const CODE_TOKEN = "\\x00CODE\\d+\\x00";

const MARKER = "\\*{1,2}|~~";

const cjkThenAlnum = new RegExp(`(${CJK})\\s+(${ALNUM})`, "g");
const alnumThenCjk = new RegExp(`(${ALNUM})\\s+(${CJK})`, "g");
const cjkThenCode = new RegExp(`(${CJK})\\s+(${CODE_TOKEN})`, "g");
const codeThenCjk = new RegExp(`(${CODE_TOKEN})\\s+(${CJK})`, "g");
const cjkThenMarker = new RegExp(`(${CJK})\\s+(${MARKER})(?=\\S)`, "g");
const markerThenCjk = new RegExp(`(?<=\\S)(${MARKER})\\s+(${CJK})`, "g");

function replaceSpaces(line: string): string {
  const masks: { placeholder: string; original: string }[] = [];
  let codeCounter = 0;
  let keepCounter = 0;

  function codeMask(match: string): string {
    const placeholder = `\x00CODE${codeCounter++}\x00`;
    masks.push({ placeholder, original: match });
    return placeholder;
  }

  function keepMask(match: string): string {
    const placeholder = `\x00KEEP${keepCounter++}\x00`;
    masks.push({ placeholder, original: match });
    return placeholder;
  }

  let masked = line.replace(/`[^`]*`/g, codeMask);
  masked = masked.replace(/https?:\/\/\S+/g, keepMask);
  masked = masked.replace(/<[A-Z][A-Za-z0-9.]*(?:\s[^>]*)?\/?>/g, (tag) => {
    return tag.replace(/"[^"]*"/g, keepMask).replace(/\{[^}]*\}/g, keepMask);
  });

  masked = masked.replace(cjkThenAlnum, "$1$2");
  masked = masked.replace(alnumThenCjk, "$1$2");
  masked = masked.replace(cjkThenCode, "$1$2");
  masked = masked.replace(codeThenCjk, "$1$2");
  masked = masked.replace(cjkThenMarker, "$1$2");
  masked = masked.replace(markerThenCjk, "$1$2");

  // Restored newest first: a JSX attribute list masks the quoted strings inside
  // it before the braces around them, so the outer mask has to come back before
  // the placeholders it contains can be found again. Replacing with a function
  // keeps "$&" and friends in the original text literal.
  let result = masked;
  for (let index = masks.length - 1; index >= 0; index -= 1) {
    const { placeholder, original } = masks[index];
    result = result.replace(placeholder, () => original);
  }
  return result;
}

export function stripCjkSpaces(mdx: string): string {
  const lines = mdx.split("\n");
  const output: string[] = [];
  let inFrontmatter = false;
  let inCodeBlock = false;

  // The frontmatter block only opens on line 0, matching the anchored regex in
  // parseFrontmatter. A "---" anywhere else is a thematic break in the body and
  // must not exempt the following lines: callers that receive the source with
  // its frontmatter blanked in place (Astro does this rather than removing it)
  // would otherwise open a phantom block from the first thematic break.
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trimStart();

    if (index === 0 && trimmed === "---") {
      inFrontmatter = true;
      output.push(line);
      continue;
    }
    if (inFrontmatter && trimmed === "---") {
      inFrontmatter = false;
      output.push(line);
      continue;
    }
    if (inFrontmatter) {
      output.push(line);
      continue;
    }

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      output.push(line);
      continue;
    }
    if (inCodeBlock) {
      output.push(line);
      continue;
    }

    if (trimmed.startsWith("import ") || trimmed.startsWith("export ")) {
      output.push(line);
      continue;
    }

    output.push(replaceSpaces(line));
  }

  return output.join("\n");
}
