import type { Element } from "hast";

export function verifiedBadge(): Element {
  return {
    type: "element",
    tagName: "svg",
    properties: {
      className: ["tweet-card__verified"],
      viewBox: "0 0 22 22",
      width: "16",
      height: "16",
      fill: "currentColor",
      "aria-label": "Verified",
    },
    children: [
      {
        type: "element",
        tagName: "path",
        properties: {
          d: "M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.855-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.69-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.636.433 1.221.878 1.69.47.446 1.055.752 1.69.883.635.13 1.294.083 1.902-.143.271.586.702 1.084 1.24 1.438.537.354 1.166.551 1.813.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z",
        },
        children: [],
      },
    ],
  };
}

export function heartIcon(): Element {
  return {
    type: "element",
    tagName: "svg",
    properties: {
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: "currentColor",
      "aria-hidden": "true",
    },
    children: [
      {
        type: "element",
        tagName: "path",
        properties: {
          d: "M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.56-1.13-1.666-1.84-2.908-1.91z",
        },
        children: [],
      },
    ],
  };
}

export function replyIcon(): Element {
  return {
    type: "element",
    tagName: "svg",
    properties: {
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: "currentColor",
      "aria-hidden": "true",
    },
    children: [
      {
        type: "element",
        tagName: "path",
        properties: {
          d: "M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.25-.893 4.42-2.49 6l-4.75 4.75c-.56.56-1.51.16-1.51-.63v-3.12h-3.87c-4.42 0-7.88-3.58-7.88-8z",
        },
        children: [],
      },
    ],
  };
}

export function playIcon(): Element {
  return {
    type: "element",
    tagName: "svg",
    properties: {
      className: ["tweet-card__play-icon"],
      viewBox: "0 0 24 24",
      width: "48",
      height: "48",
      fill: "currentColor",
      "aria-hidden": "true",
    },
    children: [
      {
        type: "element",
        tagName: "path",
        properties: {
          d: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM9.615 8.154a.5.5 0 0 0-.765.424v6.844a.5.5 0 0 0 .765.424l5.61-3.422a.5.5 0 0 0 0-.848l-5.61-3.422z",
        },
        children: [],
      },
    ],
  };
}
