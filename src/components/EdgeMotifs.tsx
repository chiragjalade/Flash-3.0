import type { CSSProperties } from "react";
import MetalSurface from "./MetalSurface";
import "./EdgeMotifs.css";

const MOTIF_SRC = "/icons/hero-motif.svg";

// "design element border line" — Figma nodes 1887:55 (left) and 1887:57 (right) of
// frame 1886:87496. The `d` below is the exported vector verbatim; the right-hand
// node is the same path mirrored, which is why one constant serves both.
//
// Inlined rather than referenced as an <img> because the whole point of it here is
// the stroke draw, and dash offset can only reach a path that is in the document.
const BORDER_LINE =
  "M0.591966 0.5H37.8858V66.6176H124.313V156.349H207.188V230.731H280V332.269H207.188V406.651H124.313V495.792H38.4778V562.5H0";
const BORDER_LINE_BOX = "0 0 280.5 563";

// The path is 1121.4081 units long in a box 280.5 wide (measured with
// getTotalLength). Published as a ratio so the CSS can turn the element's rendered
// width — which is in screen pixels, the space the dash is actually measured in —
// into the path's rendered length, at any size, with no JS and no re-measuring.
const LINE_LEN_PER_WIDTH = 1121.4081 / 280.5;

// The SVG's box is the artwork padded by 30 units a side (the mask pipeline needs
// that margin — see the file's own comment). This converts a bevel fraction defined
// against the ARTWORK into one against the padded box the canvas covers.
const ART_SHARE = 393.649 / 453.649;

// The squares are 67.781 of 393.649 art units, so half a square is ~8.6%. A bevel a
// little under that leaves each block a flat brushed face with turned edges; at half
// it would round over to a point and read as a pillow.
const BEVEL = 0.05;

/**
 * One border line.
 *
 * There is deliberately no `pathLength` here. It normalises the path in USER space,
 * but the stroke is drawn with vector-effect: non-scaling-stroke, and that makes the
 * browser dash in SCREEN space — so the two disagree by exactly the factor the SVG
 * is scaled by, and the dash covers 1/scale of the path instead of all of it. At
 * 1920 the line renders at its native 280.5 units and the scale is exactly 1, which
 * hides the bug completely; at 2000 wide it left the last 4% undrawn, which is the
 * whole bottom tail, and on a phone it over-covered and the line finished drawing
 * long before the clock had landed. The CSS measures the dash off the element's own
 * width instead, which is already in screen pixels — see LINE_LEN_PER_WIDTH.
 *
 * Which END it grows from is the mirror image of which end the path starts at, and
 * that is the whole reason the two sides differ: a positive offset walks the dash
 * forward from the start, a negative one walks it back from the finish. The path
 * begins at its top corner, and mirroring it horizontally for the right-hand side
 * does not change that — so the right line, drawing from the top, takes the
 * positive offset, and the left line, drawing from the bottom, takes the negative.
 */
function BorderLine({ side }: { side: "left" | "right" }) {
  return (
    <svg
      className={`motif-line motif-line--${side}`}
      viewBox={BORDER_LINE_BOX}
      fill="none"
      aria-hidden
    >
      <defs>
        {/* The OCEAN alloy as a gradient along the stroke. A hairline cannot carry
            the liquid-metal shader the ornaments run — there is no area to shade —
            so the impression has to come from the one thing a thin line can hold:
            darker troughs and lighter crests alternating down its length. Angled off
            vertical so the bands cross the staircase's steps rather than running
            with them.

            The whole ramp sits much higher than the alloy's own base colour, and it
            has to. A stroke this thin is mostly partial coverage, so every pixel is
            already a blend with the page behind it; taking the troughs down to the
            alloy's true #17443d left the line reading as plain black once that
            blending had had its way with it. These are the same hue held between
            about 95 and 170 in luminance, which survives the blend as green while
            still keeping enough range between stops to read as metal. */}
        <linearGradient id={`motif-line-ocean-${side}`} x1="0" y1="0" x2="0.42" y2="1">
          <stop offset="0" stopColor="#1f8a74" />
          <stop offset="0.22" stopColor="#5fd2b9" />
          <stop offset="0.44" stopColor="#1d7d69" />
          <stop offset="0.63" stopColor="#54c6ad" />
          <stop offset="0.82" stopColor="#23917a" />
          <stop offset="1" stopColor="#49bda4" />
        </linearGradient>
      </defs>
      {/* The right-hand node in Figma is this same path mirrored. Flipping it here
          rather than shipping a second `d` keeps one copy of the exported vector,
          and leaves the CSS transform free for the menu recess. */}
      <g transform={side === "right" ? "translate(280.5,0) scale(-1,1)" : undefined}>
        <path className="motif-line__base" d={BORDER_LINE} />
        {/* Same vector, second stroke. It draws itself on in the same direction the
            first one did while that one is still running off, so the two read as one
            line being replaced rather than as two lines crossing. */}
        <path
          className="motif-line__ocean"
          d={BORDER_LINE}
          stroke={`url(#motif-line-ocean-${side})`}
        />
      </g>
    </svg>
  );
}

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
  alloyRef,
}: {
  recessed?: boolean;
  /** 0 = stainless, 1 = graphite. Written by Problem as the page scrolls. */
  toneRef?: { current: number };
  /** 0 = as the tone left it, 1 = OCEAN. Comes up with the second clock, so the
   *  ornaments change metal with it rather than after it. */
  alloyRef?: { current: number };
}) {
  return (
    <div
      className="motifs"
      data-recessed={recessed || undefined}
      style={{ "--motif-line-len-ratio": LINE_LEN_PER_WIDTH } as CSSProperties}
      aria-hidden
    >
      <MetalSurface
        className="motif motif--left"
        src={MOTIF_SRC}
        artHeightShare={ART_SHARE}
        bevelFrac={BEVEL}
        trackPointer={false}
        toneRef={toneRef}
        alloyRef={alloyRef}
      />
      <MetalSurface
        className="motif motif--right"
        src={MOTIF_SRC}
        artHeightShare={ART_SHARE}
        bevelFrac={BEVEL}
        trackPointer={false}
        toneRef={toneRef}
        alloyRef={alloyRef}
      />
      <BorderLine side="left" />
      <BorderLine side="right" />
    </div>
  );
}
