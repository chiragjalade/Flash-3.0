import { useEffect, useRef } from "react";
import { fieldDataURL, FIELD_EDGE } from "../lib/dialField";

// Generous enough for the drop-shadow the clock's case carries — 26px of blur and
// 20px of offset against a box a few hundred wide, so a quarter of the box on every
// side clears it with room to spare.
const REGION = { x: "-25%", y: "-25%", w: "150%", h: "150%" } as const;

/**
 * An SVG filter that takes a whole element apart on the dial's own turbulence.
 *
 * The clock is not one texture — it is a bezel canvas, an SVG, a glow canvas and a
 * dial canvas stacked up — so there is nothing to hand a shader. A filter is the one
 * thing that can reach all of it at once: the noise is loaded as an image, turned
 * into an alpha channel, thresholded hard, and used to cut the source. Sliding the
 * threshold across the field is what makes the clock come apart in tendrils rather
 * than simply fade.
 *
 * The threshold is two numbers on a feFunc, and they are set straight on the element
 * from the caller's frame loop. They cannot come from CSS: filter primitives are not
 * styled, so a custom property never reaches them.
 */
export default function Dissolve({
  id,
  amountRef,
}: {
  id: string;
  /** 0 = whole, 1 = gone. */
  amountRef: { current: number };
}) {
  const funcRef = useRef<SVGFEFuncAElement>(null);

  useEffect(() => {
    const fn = funcRef.current;
    if (!fn) return;
    let raf = 0;
    let last = -1;
    const E = FIELD_EDGE;
    const tick = () => {
      const v = amountRef.current;
      if (Math.abs(v - last) > 0.0005) {
        last = v;
        // Pushed out by E at both ends so 0 leaves the clock completely whole and 1
        // removes all of it, with no sliver surviving at either extreme.
        const t = v * (1 + 2 * E) - E;
        // alpha = 1 where the noise is above the threshold, 0 below, across a band
        // 2E wide — a hard edge here would give the tendrils jagged, aliased rims.
        fn.setAttribute("slope", String(1 / (2 * E)));
        fn.setAttribute("intercept", String(-(t - E) / (2 * E)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amountRef]);

  return (
    <svg className="fx-defs" aria-hidden focusable="false">
      <defs>
        {/* sRGB, not the linearRGB filters default to: the field is authored as
            plain grey levels, and gamma-shifting them would bend the threshold. */}
        {/* The region has to clear the clock's own drop-shadow, which reaches well
            past its box — anything the filter does not cover is cut away, and the
            shadow was being sliced off square along the region's edge.

            The noise then has to cover the SAME region, not the element: a primitive
            subregion smaller than the filter region leaves the mask empty outside
            it, and empty mask under an "in" composite means gone. Both are stated as
            the identical box so they cannot drift apart. */}
        <filter
          id={id}
          x={REGION.x}
          y={REGION.y}
          width={REGION.w}
          height={REGION.h}
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={fieldDataURL()}
            x={REGION.x}
            y={REGION.y}
            width={REGION.w}
            height={REGION.h}
            preserveAspectRatio="none"
            result="field"
          />
          <feColorMatrix in="field" type="luminanceToAlpha" result="fieldAlpha" />
          <feComponentTransfer in="fieldAlpha" result="cut">
            <feFuncA ref={funcRef} type="linear" slope="3.125" intercept="1.5" />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="cut" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}
