import MetalSurface from "./MetalSurface";
import "./EdgeMotifs.css";

const MOTIF_SRC = "/icons/hero-motif.svg";

// The SVG's box is the artwork padded by 30 units a side (the mask pipeline needs
// that margin — see the file's own comment). This converts a bevel fraction defined
// against the ARTWORK into one against the padded box the canvas covers.
const ART_SHARE = 393.649 / 453.649;

// The squares are 67.781 of 393.649 art units, so half a square is ~8.6%. A bevel a
// little under that leaves each block a flat brushed face with turned edges; at half
// it would round over to a point and read as a pillow.
const BEVEL = 0.05;

/**
 * The pair of edge ornaments, fixed to the viewport.
 *
 * They live outside both page sections on purpose. Every frame in the Figma file
 * places them identically, and the brief is that they hold still while the page
 * moves past — so this is one pair pinned to the viewport rather than a copy per
 * section that scrolls away and is replaced. It also halves the number of shader
 * surfaces the page has to keep running.
 */
export default function EdgeMotifs({
  recessed = false,
  toneRef,
}: {
  recessed?: boolean;
  /** 0 = stainless, 1 = graphite. Written by Problem as the page scrolls. */
  toneRef?: { current: number };
}) {
  return (
    <div className="motifs" data-recessed={recessed || undefined} aria-hidden>
      <MetalSurface
        className="motif motif--left"
        src={MOTIF_SRC}
        artHeightShare={ART_SHARE}
        bevelFrac={BEVEL}
        trackPointer={false}
        toneRef={toneRef}
      />
      <MetalSurface
        className="motif motif--right"
        src={MOTIF_SRC}
        artHeightShare={ART_SHARE}
        bevelFrac={BEVEL}
        trackPointer={false}
        toneRef={toneRef}
      />
    </div>
  );
}
