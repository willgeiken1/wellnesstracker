import { app } from "../runtime.js";
import { ICON_SET } from "./icon-set.js";

/* Every icon in the app comes from the one Insight set (design/icons/insight-icons.json, written into
   icon-set.js by native/scripts/gen-icons.cjs). The set is drawn on a 24 box with a 1.75 line in currentColor. */

/** One icon as an inline SVG. It is decorative: the control around it carries the label.
    With no size it is 1em square, so it takes the size of the text it replaces; a CSS rule for the slot
    (.tab svg, .icon-btn svg) still sets its own size. `cls` adds classes and `size` sets a fixed pixel size. */
export function icon(name, { cls = "", size = 0 } = {}) {
  const inner = ICON_SET[name];
  if (!inner) throw new Error(`No icon named "${name}"`);
  const box = size ? ` width="${size}" height="${size}"` : "";
  return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24"${box} aria-hidden="true" focusable="false">${inner}</svg>`;
}
app.icon = icon;

/* Inline icons used across pages. */
/* ================= Icons ================= */
const I = {
  chevR: icon("chevron-right", { cls: "chev" }),
  chevL: icon("chevron-left"),
  chevD: icon("chevron-down"),
  grip: icon("drag-handle")
};
app.I = I;
