/**
 * Clipboard helpers shared by every copy-to-clipboard interaction.
 * Ported verbatim from apps/web/src/lib/clipboard.ts.
 */

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function copyPng(uri: string): Promise<void> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const pngBlob = new Blob([await blob.arrayBuffer()], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
}
