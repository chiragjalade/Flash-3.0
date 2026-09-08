import type { CSSProperties } from "react";
import "./AbstractLines.css";

/**
 * The "abstract lines", 1722:125 and 1722:136 of frame 1722:3.
 *
 * Fixed to the viewport rather than laid inside the section they belong to. The
 * brief is that they draw themselves ONTO THE SCREEN as the page arrives, and a
 * layer inside the section cannot do that: while the page is still rising, the
 * section is moving, so its contents rise with it and the lines would be sliding up
 * as they draw. Pinning them is also what the frame means — they run the full 1080
 * of it, edge to edge, which is a property of the viewport and not of any element in
 * the flow.
 *
 * Same layer strategy as the edge ornaments beside them, for the same reason, and
 * driven the same way: Features publishes its progress on the document element,
 * because this is a fixed sibling of that section rather than a child and there is
 * no other element both can see.
 *
 * Geometry: vertical hairlines that all touch one horizontal edge of the screen and
 * reach different distances in from it — 206, 259 and 326 of 1080, getting longer as
 * they move inward. The frame draws one group and re-uses it three times: flipped
 * vertically for the top, and the pair mirrored horizontally for the right. One
 * table serves all of them here too; writing the mirrors out by hand is how a stray
 * number in one corner survives every review of the other three.
 *
 * The frame has a fourth in each group, at x=279.5 and a full 416 long. It is left
 * out: it is the one that reaches furthest in, and at the centre area's width it
 * crowds the panel rather than framing it.
 */
const LINE_X = [37.5, 124.5, 206.5].map((x) => (x / 1920) * 100);
const LINE_LEN = [206, 259, 326].map((h) => (h / 1080) * 100);

/** Group order is the frame's own numbering — "abstract lines 1" is the bottom
 *  left, 2 the top left, 3 the top right, 4 the bottom right — and that is the
 *  order they animate in. */
const GROUPS = [
  { name: "abstract lines 1", side: "left", edge: "bottom" },
  { name: "abstract lines 2", side: "left", edge: "top" },
  { name: "abstract lines 3", side: "right", edge: "top" },
  { name: "abstract lines 4", side: "right", edge: "bottom" },
] as const;

const LINES = GROUPS.flatMap((group, g) =>
  LINE_X.map((x, i) => ({
    key: `${g}-${i}`,
    // Every line grows from the edge it is anchored to, inward — both the direction
    // the frame's geometry implies and the one the border lines already use.
    style: {
      "--n": g * LINE_X.length + i,
      [group.side]: `${x}%`,
      [group.edge]: 0,
      height: `${LINE_LEN[i]}%`,
      transformOrigin: group.edge,
    } as CSSProperties,
  })),
);

export default function AbstractLines() {
  return (
    <div
      className="abstract-lines"
      // The stagger divides the window by the number of gaps between strokes, and
      // that has to follow the table above rather than be restated in the CSS —
      // dropping a line from each group and leaving a stale divisor behind is how
      // the last stroke quietly stops finishing on time.
      style={{ "--n-max": LINES.length - 1 } as CSSProperties}
      aria-hidden
    >
      {LINES.map((l) => (
        <span key={l.key} className="abstract-line" style={l.style} />
      ))}
    </div>
  );
}
