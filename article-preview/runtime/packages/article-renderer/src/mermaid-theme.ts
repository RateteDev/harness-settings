import type { MermaidConfig } from "mermaid";

/**
 * Shared Mermaid configuration for build-time SVG rendering.
 */
export const mermaidConfig: MermaidConfig = {
  theme: "dark",
  securityLevel: "strict",
  // Render labels as SVG <text>, not foreignObject HTML. HTML labels are sized
  // by a build-time headless measurement, but a viewer applying its own CSS
  // cascade widens the text past the measured (overflow:hidden) box and clips
  // the last glyph. SVG text is not clipped.
  htmlLabels: false,
  themeVariables: {
    darkMode: true,
    background: "#111",
    fontFamily: "Moralerspace, ui-monospace, Menlo, monospace",
    fontSize: "15px",

    primaryColor: "#1f1f1f",
    primaryTextColor: "#ddd",
    primaryBorderColor: "#ddd",
    secondaryColor: "#262626",
    secondaryTextColor: "#ddd",
    secondaryBorderColor: "#5a5a5a",
    tertiaryColor: "#181818",
    tertiaryTextColor: "#ddd",
    tertiaryBorderColor: "#5a5a5a",

    lineColor: "#ddd",
    textColor: "#ddd",
    mainBkg: "#1f1f1f",
    nodeBorder: "#ddd",
    clusterBkg: "#181818",
    clusterBorder: "#5a5a5a",
    titleColor: "#ddd",
    edgeLabelBackground: "#111",

    actorBkg: "#1f1f1f",
    actorBorder: "#ddd",
    actorTextColor: "#ddd",
    actorLineColor: "#777",
    signalColor: "#ddd",
    signalTextColor: "#ddd",
    labelBoxBkgColor: "#1f1f1f",
    labelBoxBorderColor: "#ddd",
    labelTextColor: "#ddd",
    loopTextColor: "#ddd",
    noteBkgColor: "#262626",
    noteTextColor: "#ddd",
    noteBorderColor: "#ddd",
    activationBkgColor: "#262626",
    activationBorderColor: "#ddd",
    sequenceNumberColor: "#111",

    labelColor: "#ddd",
    errorBkgColor: "#552020",
    errorTextColor: "#ddd",

    attributeBackgroundColorOdd: "#181818",
    attributeBackgroundColorEven: "#1f1f1f",

    pie1: "#56b4e9",
    pie2: "#e69f00",
    pie3: "#009e73",
    pie4: "#cc79a7",
    pie5: "#f0e442",
    pie6: "#408fc7",
    pie7: "#d55e00",
    pie8: "#999999",
    pie9: "#76b7b2",
    pie10: "#b07aa1",
    pie11: "#ffb55a",
    pie12: "#8cd17d",
    pieTitleTextColor: "#ddd",
    pieSectionTextColor: "#111",
    pieLegendTextColor: "#ddd",
    pieStrokeColor: "#111",
    pieOuterStrokeColor: "#111",

    stateLabelColor: "#ddd",
    stateBkg: "#1f1f1f",
    compositeBackground: "#181818",
    compositeBorder: "#5a5a5a",
    compositeTitleBackground: "#262626",
    altBackground: "#181818",
    innerEndBackground: "#111",
    specialStateColor: "#ddd",
    transitionColor: "#ddd",
    transitionLabelColor: "#ddd",
  },
};
