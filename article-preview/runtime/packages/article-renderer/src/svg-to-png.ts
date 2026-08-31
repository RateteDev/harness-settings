import { Resvg } from "@resvg/resvg-js";

export function svgToPng(svg: string, scale = 2): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
  });
  return resvg.render().asPng();
}
