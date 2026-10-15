import { Mark, mergeAttributes } from "@tiptap/core";

/** Сохраняет метки пунктов договора из бекенда внутри TipTap. */
export const ClauseTargetMark = Mark.create({
  name: "clauseTarget",
  inclusive: false,
  excludes: "",
  spanning: false,

  parseHTML() {
    return [
      { tag: "span.tn-clause-target" },
      { tag: "span.tn-clause-pin" },
      { tag: "span.tn-clause-hit" },
      { tag: "span[data-finding-id]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const cls = String(HTMLAttributes.class || "tn-clause-target");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: cls.includes("tn-clause") ? cls : `tn-clause-target ${cls}`.trim(),
      }),
      0,
    ];
  },

  addAttributes() {
    return {
      class: { default: "tn-clause-target" },
      id: { default: null },
      "data-finding-id": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-finding-id"),
        renderHTML: (attrs) =>
          attrs["data-finding-id"]
            ? { "data-finding-id": attrs["data-finding-id"] }
            : {},
      },
      "data-anchor": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-anchor"),
        renderHTML: (attrs) =>
          attrs["data-anchor"] ? { "data-anchor": attrs["data-anchor"] } : {},
      },
    };
  },
});
