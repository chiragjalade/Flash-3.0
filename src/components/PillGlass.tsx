import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { LConfig } from "../glassParams";

/* Edge refraction + rim chromatic dispersion for the docked prompt pill.
   ---------------------------------------------------------------------------
   Why this exists rather than reusing GlassLayer: that shader only samples the
   background PHOTO (u_bg), and its canvas sits at z-index -1 — so it cannot
   refract the DOM message bubbles that scroll behind the docked pill, which is
   exactly why SELECTOR there excludes `.prompt--dock`. `backdrop-filter` CAN
   see that DOM content, but CSS has no lens primitive, so we hand it SVG filters
   whose displacement maps are generated per size on a canvas below.

   Two filters, because they refract two different things:

   #pill-glass       backdrop-filter — bends what is BEHIND the pill, at the rim.
   #pill-glass-text  filter          — bends the pill's OWN text, plus a soft
                                       reflection folded back off the edges.

   Chrome/Safari only: Firefox ignores url() inside backdrop-filter and falls
   back to the plain frost already on the pill. */

export const PILL_GLASS_ID = "pill-glass";
export const PILL_TEXT_ID = "pill-glass-text";

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
/* Signed distance to a rounded rect centred in a `pad`-padded canvas.
   Negative inside, 0 on the contour. */
function makeSdf(w: number, h: number, radius: number, pad: number) {
  const cx = (w + pad * 2) / 2;
  const cy = (h + pad * 2) / 2;
  const bx = w / 2;
  const by = h / 2;
  const r = Math.max(0, Math.min(radius, bx, by));
  return (x: number, y: number) => {
    const qx = Math.abs(x - cx) - (bx - r);
    const qy = Math.abs(y - cy) - (by - r);
    return (
      Math.min(Math.max(qx, qy), 0) +
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
      r
    );
  };
}

/* Every map is generated `pad` px larger than the element on all sides and is
   NEUTRAL GREY throughout that margin. This is mandatory, not tidiness: the
   filter region has to extend past the element (the rim pulls in content from
   outside it, and the element's drop shadow must not be clipped), and wherever
   `in2` is undefined feDisplacementMap reads transparent black — R=G=0 — which
   is a displacement of scale × (0 − 0.5), i.e. a hard −scale/2 shift in BOTH
   axes. That painted a second, offset ghost of the whole pill in the margin. */
function newMap(w: number, h: number, pad: number) {
  const cvs = document.createElement("canvas");
  cvs.width = Math.max(1, w + pad * 2);
  cvs.height = Math.max(1, h + pad * 2);
  const ctx = cvs.getContext("2d");
  return { cvs, ctx, img: ctx?.createImageData(cvs.width, cvs.height) };
}

/* Outward normal of the contour, from the SDF gradient. */
function normalAt(
  sdf: (x: number, y: number) => number,
  x: number,
  y: number,
) {
  const nx = sdf(x + 1, y) - sdf(x - 1, y);
  const ny = sdf(x, y + 1) - sdf(x, y - 1);
  const l = Math.hypot(nx, ny) || 1;
  return [nx / l, ny / l] as const;
}

/* Roll-off profile. One set of values now, not two per edge: the TOP band is
   suppressed entirely (see TOP_SUPPRESS below), so the effect runs along the sides
   and the bottom, and those should match rather than inherit whichever half of the
   pill they happen to fall in.

   How far in the reflection starts is set by k, not by the rim compression: ink
   shows where dn + amp >= the ink line, and amp = (rOut − dn)(1 − k), so a smaller
   k pulls it closer to the glass edge. Rim compression is the opposite lever — it
   squeezes the outermost part into a thinner sliver and pushes the start inward. */
const ROLL = { kCentre: 0.16, kCap: 0.1, sRim: 1.6, rimRamp: 6 };
/* The k in play → the largest amplitude the channel must hold. */
const ROLL_K_MIN = ROLL.kCap;

/* --- map 1: rounded-rect bevel normal map, for the BACKDROP -----------------
   R = 128 + nx*amp, G = 128 + ny*amp (128 = no displacement), so
   feDisplacementMap reads the outward normal scaled by the edge factor. */
function bevelMap(
  w: number,
  h: number,
  radius: number,
  bevel: number,
  gamma: number,
  pad: number,
) {
  const { cvs, ctx, img } = newMap(w, h, pad);
  if (!ctx || !img) return "";
  const sdf = makeSdf(w, h, radius, pad);
  for (let y = 0; y < cvs.height; y++) {
    for (let x = 0; x < cvs.width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = sdf(px, py);
      const [nx, ny] = normalAt(sdf, px, py);
      // 0 across the flat interior → 1 at the rim, smoothstepped. The smoothstep
      // matters for more than looks: a ramp with a non-zero derivative at the
      // contour packs a huge displacement gradient into the last pixel or two,
      // which aliases into visible banding along the edge. (GlassLayer.tsx:177
      // fights the same aliasing by frosting its rim harder than its body.)
      const t = Math.min(Math.max(1 + d / bevel, 0), 1);
      const s = t * t * (3 - 2 * t);
      // ...and hard-zeroed OUTSIDE the contour, so the padded margin carries no
      // displacement at all. Safe precisely there: backdrop-filter clips to the
      // border box, so no destination pixel outside the contour is ever painted,
      // and the last pixel INSIDE still gets full amplitude.
      const amp = d > 0 ? 0 : Math.pow(s, gamma) * 127;
      const i = (y * cvs.width + x) * 4;
      img.data[i] = 128 + nx * amp;
      img.data[i + 1] = 128 + ny * amp;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cvs.toDataURL();
}

/* --- map 2: the pill's own TEXT ---------------------------------------------
   A displacement TRANSLATES; only its GRADIENT stretches — a field can be large
   somewhere and still do visually nothing there. That drives every shape here.

   This map now carries ONLY the edge roll-off. It used to also carry two "lens
   shoulders", one keyed on horizontal distance from the caps and one on vertical
   distance from the top/bottom, which bent the typed text itself. They are gone:
   the horizontal one put up to 9.5px of shift on normal text within 78px of each
   cap — 73% of a character width — which reads as the text being mangled rather
   than refracted. All distortion is now confined to the roll-off band at the top
   and bottom edges, so the reading area is pristine.

   Dropping them also shrank the channel scale from 58.4 to 36.5, taking the map's
   quantum from 0.229px to 0.143px — which cuts the stretch-amplified jitter that
   made the reflected glyph edges look stepped. */
function textRollOffMap(
  w: number,
  h: number,
  radius: number,
  pad: number,
  scale: number,
  roll: { rIn: number; rOut: number; capReach: number },
) {
  const { cvs, ctx, img } = newMap(w, h, pad);
  if (!ctx || !img) return "";
  const sdf = makeSdf(w, h, radius, pad);
  const ch = (shift: number) =>
    Math.max(-127, Math.min(127, (shift / scale) * 255));
  const cx = pad + w / 2;
  /* Rim-compression slope profile, integrated once. f() is 1 at the band's outer
     edge and eases to 0 over `RIM_RAMP` px; rimF is its running integral from dn
     out to rOut, sampled on a 0.25px grid and lerped. */
  /* Slope at the rim — above 1, so content compresses there. Asymmetric on
     purpose: the top band squeezes harder than the bottom, so it reads as a
     thinner wisp. Any value > 0 keeps the mapping monotonic, since the slope is
     k + (S_RIM − k)·f and f ∈ [0,1] — so this is safe to push. */
  // Magnification of the reflected content: 1/(1 − MAG) at the pill's centre.
  const MAG = 0.03;
  const STEP = 0.25;
  const buildRim = (ramp: number) => {
    const f = (d: number) => 1 - smoothstep(0, ramp, d - roll.rIn);
    const n = Math.ceil((roll.rOut - roll.rIn) / STEP) + 1;
    const t = new Array<number>(n).fill(0);
    let acc = 0;
    for (let i = n - 2; i >= 0; i--) {
      acc += ((f(roll.rIn + i * STEP) + f(roll.rIn + (i + 1) * STEP)) / 2) * STEP;
      t[i] = acc;
    }
    return t;
  };
  const rimTable = buildRim(ROLL.rimRamp);
  const rimF = (table: number[], dn: number) => {
    const q = (dn - roll.rIn) / STEP;
    const i = Math.floor(q);
    if (i < 0) return table[0] ?? 0;
    if (i >= table.length - 1) return 0;
    const a = table[i] ?? 0;
    const b = table[i + 1] ?? 0;
    return a + (b - a) * (q - i);
  };
  for (let y = 0; y < cvs.height; y++) {
    for (let x = 0; x < cvs.width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dn = -sdf(px, py);
      /* EDGE ROLL-OFF, folded into this same map rather than composited as its own
         translucent pass. Previously it was a second layer — displace, blur, mask,
         fade to 55%, draw over the body — and laying a semi-opaque sheet over part
         of the glass is exactly what made that band read as a separate pane
         sitting on the surface instead of as the surface itself.

         As a displacement it has no opacity of its own: the text simply IS
         stretched there, on the one glass layer.

            depth(dn) = rOut − (rOut − dn)·k      slope k > 0, never inverted
            stretch   = 1/k, k smaller toward the caps

         The window no longer fades ALPHA — it fades the displacement, so at both
         ends of the band content settles back to its own depth. At the inner end
         that means continuity with the real text; at the outer end it means the
         empty border region, so the streaks thin out on their own. */
      const { rIn, rOut, capReach } = roll;
      let rollX = 0;
      let rollY = 0;
      if (dn > rIn && dn < rOut) {
        const capW =
          1 - smoothstep(0, capReach, Math.min(px - pad, pad + w - px));
        const k = ROLL.kCentre + (ROLL.kCap - ROLL.kCentre) * capW;
        /* RIM COMPRESSION. Slope is what decides thickness: < 1 spreads the source
           out, > 1 squeezes it. A single slope k gave the band one uniform smear
           all the way to the edge. Ramping the slope UP over the outermost
           `rimRamp` px squeezes the content into a thin sliver right at the rim,
           which is what a surface curving away steeply actually does.

           Built as an integral of a strictly positive slope, so it cannot invert:

              slope(dn) = k + (sRim − k)·f(dn),   f = 1 at the rim → 0 inward
              amp(dn)   = (rOut − dn)(1 − k) − (sRim − k)·F(dn),   F = ∫f

           F is precomputed per map (it depends only on dn, not on x). */
        /* Amplitude is the RAW ramp, gated only by the 3px border guard. It used
           to be multiplied by a window as well, and that window is what made the
           band run backwards.

           The mapping's slope is d(dn + amp)/ddn. With the raw linear ramp,
           amp = (rOut − dn)(1 − k), that is exactly k — positive, so the band
           always travels with the text. Multiply amp by a window and the window's
           own gradient enters the slope:

              slope = 1 − win(1−k) + win′·(1−k)·(rOut − dn)

           win′ is negative across the inner taper, and (rOut − dn) is large there,
           so the second term overwhelmed the first. Measured min slope −0.42 at
           dn≈11px, inverted across ~5px that samples real ink — so that stretch of
           the band scrolled the opposite way to the text.

           The window is not needed anyway: at the rim the ramp already samples
           above the ink line (blank glass), so the band fades out on its own. */
        const [nx, ny] = normalAt(sdf, px, py);
        /* NO ROLL-OFF ON THE TOP EDGE. Which edge a pixel belongs to is not its
           position but the direction its nearest contour point lies in — the
           outward normal. -ny is 1 where that is straight up, 0 along the sides,
           −1 at the bottom, so `-ny` is exactly "how much of a top-edge pixel is
           this". Suppressing on that rather than on `py < cy` is what keeps the
           corners from seaming: the normal rotates smoothly from up to sideways
           around the arc, so the band fades in as it wraps rather than switching
           on at a line. */
        const topSuppress = 1 - smoothstep(0.15, 0.85, -ny);
        const amp =
          ((rOut - dn) * (1 - k) - (ROLL.sRim - k) * rimF(rimTable, dn)) *
          smoothstep(0, 3, dn) *
          topSuppress;
        /* MAGNIFICATION of the reflected content — a horizontal expansion, since
           the vertical axis is already stretched 6x by the roll-off and adding
           width is what makes it read as magnified rather than merely smeared.

           A plain scale about the centre (x' = cx + (x−cx)/M) is unaffordable
           here: the displacement grows linearly with distance from centre, so even
           3% costs 13px at the caps, and the channel is already carrying the
           shoulder and the roll. This uses

              x' = cx + hw·(u − MAG·sin(πu)/π),      u = (px − cx)/hw

           which is the same 1/(1−MAG) magnification at the centre but BOUNDED:
           |dx| peaks at hw·MAG/π ≈ 4px and returns to zero at the caps, so the
           pill's ends are untouched. Slope is 1 − MAG·cos(πu) ≥ 1 − MAG > 0, so it
           cannot invert. The trade is that the outer thirds compress slightly
           instead of magnifying — unavoidable, since a monotonic map with fixed
           endpoints must average a slope of 1. */
        const uMag = (px - cx) / (w / 2);
        // tapered off before the real text, so typed glyphs are not magnified
        const magW = 1 - smoothstep(rOut - 8, rOut, dn);
        const magX =
          -((w / 2) * MAG * Math.sin(Math.PI * uMag) * magW) / Math.PI;
        rollX = -nx * amp + magX; // inward — toward the content being pulled up
        rollY = -ny * amp;
      }
      const i = (y * cvs.width + x) * 4;
      img.data[i] = 128 + ch(rollX);
      img.data[i + 1] = 128 + ch(rollY);
      /* B carries the DISPERSION ZONE weight (unused by feDisplacementMap, which
         reads only R and G). Downstream it becomes an alpha mask confining the
         colour split to where the glass actually bends — now exactly the roll-off
         band, since that is the only thing left that displaces. Tied to rOut
         rather than a fixed 28px: at 28 it reached ~17% onto the first line of
         real text, putting colour fringing in the reading area. Its own tight 4px
         guard keeps the three-pass path off the 1px border. */
      const rim =
        (1 - smoothstep(roll.rOut - 8, roll.rOut, dn)) * smoothstep(0, 4, dn);
      img.data[i + 2] = rim * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cvs.toDataURL();
}

/* --- map 3: rim-blur weight -------------------------------------------------
   1px WIDE, stretched across the region by preserveAspectRatio="none".
   Alpha = 1 at the top/bottom edges, easing to 0 by `fade` px in.

   `feGaussianBlur` has a single stdDeviation and cannot vary across an element, so
   softening only the rim means rendering the body twice and cross-fading — this is
   the mask that does it. Not a translucent overlay: both inputs are the same
   opaque surface, so it stays one layer.

   Keyed on vertical distance rather than the SDF, which is fine here because it
   only selects softness — nothing is displaced by it, so the corner-cut-out
   hazard of §5.3 does not apply. */
function rimBlurMap(
  h: number,
  pad: number,
  fade: number,
  topWeight: number,
  bottomWeight: number,
) {
  const cvs = document.createElement("canvas");
  cvs.width = 1;
  cvs.height = Math.max(1, h + pad * 2);
  const ctx = cvs.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(1, cvs.height);
  for (let y = 0; y < cvs.height; y++) {
    const py = y + 0.5;
    const dv = Math.min(py - pad, pad + h - py);
    /* Decays with depth, so within a band the part nearest the edge is the
       blurriest. Scaled per edge on top of that: only ONE blur level exists to
       cross-fade against (feGaussianBlur takes a single stdDeviation), so a
       weaker weight is how the bottom gets less of it. */
    const edgeWeight = py < pad + h / 2 ? topWeight : bottomWeight;
    const wgt = (1 - smoothstep(2, fade, dv)) * edgeWeight;
    const i = y * 4;
    img.data[i] = 0;
    img.data[i + 1] = 0;
    img.data[i + 2] = 0;
    img.data[i + 3] = (dv < 0 ? 0 : wgt) * 255;
  }
  ctx.putImageData(img, 0, 0);
  return cvs.toDataURL();
}

export default function PillGlass({
  targetRef,
  config,
}: {
  targetRef: RefObject<HTMLElement | null>;
  config?: LConfig;
}) {
  // Live border-box, corner radius, and the bottom text-free inset of the pill
  // (it auto-grows as you type). That inset matters because it is the only strip
  // the roll-off can occupy without landing on top of what you typed.
  const [box, setBox] = useState({ w: 0, h: 0, r: 0, pt: 0 });

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const read = () => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const r = parseFloat(cs.borderTopLeftRadius) || 0;
      /* The strip the roll-off band lives in, measured from the BOTTOM edge —
         that is where the band is (top suppressed, see ROLL). Border + padding
         rather than padding alone: the pill has no border now, but it did carry
         the strip as one, and the sum is what the geometry actually depends on.

         Note this is the RESTING inset, not a text-free guarantee: with no border
         on any edge the clip sits at the glass, so scrolled text runs into this
         strip and the band displaces it. */
      const pt =
        (parseFloat(cs.borderBottomWidth) || 0) +
        (parseFloat(cs.paddingBottom) || 0);
      const w = Math.round(b.width);
      const h = Math.round(b.height);
      setBox((p) =>
        p.w === w && p.h === h && p.r === r && p.pt === pt
          ? p
          : { w, h, r, pt },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [targetRef]);

  const n = (k: string, d: number) => Number(config?.[k] ?? d);
  const thickness = n("thickness", 20);
  const ok = box.w > 0 && box.h > 0;

  // How far in from the rim the backdrop's curvature reaches. Clamped so a short
  // pill's bevel never swallows its whole height.
  const bevel = Math.max(4, Math.min(thickness * 0.9, box.h * 0.45));
  // Mirrors App's #lg-glass math so the Liquid Glass Pro sliders drive this too.
  const base = n("refractionFactor", 3.16) * (0.5 + thickness / 40) * 6;
  // The visible fringe is the DIFFERENCE between the R and B sample offsets.
  // 0.025/unit was invisible (~3px); 0.055 overshot into a hard rainbow ring.
  const spread = 1 + n("dispersionGain", 7) * 0.04;
  const pad = Math.ceil(base * spread + 12);

  // Text amplitudes, in PIXELS of shift.

  /* The reflection strip. Its outer limit is set by the pill's own top padding,
     because that is the only band with no glyphs in it — push past that and the
     ghost composites over the text you are typing. `+3` walks it right up to
     where ink actually starts (the ascender gap below the padding edge).

     The mapping is anchored so depth(rOut) === rOut: at the strip's inner
     boundary it samples its OWN depth, so the band is identical to the real
     content it abuts and the two are continuous. Any other anchor leaves a jump
     there, which reads as a gap between the text and the effect. */
  const rIn = 2; // clear the 1px border
  /* `+2` keeps the band's inner edge just past where ink starts. It was `+6`,
     which pushed the anchor 6px into the glyphs and therefore made the band echo
     ~8px of fully-visible text — whole descenders reappearing above and below
     lines that were not being cut at all. */
  const rOut = Math.max(6, Math.min(box.pt + 2, box.h * 0.45));
  /* Stretch = 1/k. Smaller k at the caps → more stretch there, less mid-width.
     Both ends bend; the caps just bend harder. K_CENTRE started at 0.72 (1.4x),
     which was too close to flat to read as a bend at all mid-width.

     k is also exactly how much SOURCE the band consumes: the sampled span is
     (rOut − rIn)·k. That decoupling is what lets the band get BROADER without
     echoing more text — widen (rOut − rIn) and drop k by the same factor and the
     sampled sliver is unchanged, it just gets smeared over more space. */
  const capReach = Math.max(80, box.r * 6);
  const roll = { rIn, rOut, capReach };

  /* One channel now carries the shoulder AND the roll-off, since they were merged
     into a single map. A displacement channel holds at most ±0.498 * scale, so the
     scale is derived from that worst case with 15% headroom — hand-tuning it would
     silently clip the roll flat and stop it stretching. */
  const rollMax = (rOut - rIn) * (1 - ROLL_K_MIN);
  const textBase = (rollMax / 0.498) * 1.15;
  /* Glyph strokes are ~1px, so a split that reads as a subtle fringe on a photo
     reads as coloured ghosting on text. Rate is far lower than it looks because
     textBase roughly tripled when the roll-off moved into this channel — the split
     is textBase*(sp - 1/sp)*0.498, so sp has to shrink to hold it near 1.5px. */
  const textSpread = 1 + n("dispersionGain", 7) * 0.0022;
  // Softness applied only within the roll-off strip (see rimBlurMap). Text starts
  // at box.pt, by which point the weight is ~0, so typed text stays crisp.
  const RIM_BLUR = 2.6;
  // 0 on the top: with no roll-off up there, blurring it would only soften empty
  // glass and the tops of the glyphs for no reason.
  // Smoothing applied to the displacement map itself, in px.
  const MAP_SMOOTH = 1.0;
  // Full strength on the top band, well under half on the bottom.
  const RIM_BLUR_TOP = 0;
  const RIM_BLUR_BOTTOM = 0.42;
  // `filter` (unlike backdrop-filter) does NOT clip to the border box, so this
  // region must also contain the pill's outer drop shadow — glass.css spreads it
  // by --g-shadow-spread (~18px) at a -10px offset — or the shadow gets cut off.
  const textPad = Math.ceil(textBase * textSpread) + 34;

  const map = useMemo(
    () => (ok ? bevelMap(box.w, box.h, box.r, bevel, 1.3, pad) : ""),
    [ok, box.w, box.h, box.r, bevel, pad],
  );
  const textMap = useMemo(
    () =>
      ok
        ? textRollOffMap(box.w, box.h, box.r, textPad, textBase, roll)
        : "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ok, box.w, box.h, box.r, textPad, textBase, rIn, rOut, capReach],
  );

  const rimMap = useMemo(
    () =>
      ok
        ? rimBlurMap(box.h, textPad, rOut, RIM_BLUR_TOP, RIM_BLUR_BOTTOM)
        : "",
    [ok, box.h, textPad, rOut],
  );

  if (!map || !textMap || !rimMap) return null;

  const region = (p: number) => ({
    filterUnits: "userSpaceOnUse" as const,
    x: -p,
    y: -p,
    width: box.w + p * 2,
    height: box.h + p * 2,
    colorInterpolationFilters: "sRGB" as const,
  });
  // subregion must match the filter region exactly — see newMap()
  const mapImage = (href: string, p: number, result: string) => (
    <feImage
      href={href}
      x={-p}
      y={-p}
      width={box.w + p * 2}
      height={box.h + p * 2}
      preserveAspectRatio="none"
      result={result}
    />
  );
  const pass = (id: string, from: string, scale: number) => (
    <feDisplacementMap
      in="SourceGraphic"
      in2={from}
      scale={scale}
      xChannelSelector="R"
      yChannelSelector="G"
      result={id}
    />
  );
  // isolate one channel per pass, then add the three back together
  const only = (src: string, out: string, row: 0 | 1 | 2) => (
    <feColorMatrix
      in={src}
      result={out}
      type="matrix"
      values={[
        `${row === 0 ? 1 : 0} 0 0 0 0`,
        `0 ${row === 1 ? 1 : 0} 0 0 0`,
        `0 0 ${row === 2 ? 1 : 0} 0 0`,
        `0 0 0 1 0`,
      ].join("  ")}
    />
  );
  const add = (a: string, b: string, out?: string) => (
    <feComposite
      in={a}
      in2={b}
      operator="arithmetic"
      k1={0}
      k2={1}
      k3={1}
      k4={0}
      result={out}
    />
  );
  // scale one layer's alpha to a third — see `dispersive`
  const third = (src: string, out: string) => (
    <feComponentTransfer in={src} result={out}>
      <feFuncA type="linear" slope={1 / 3} intercept={0} />
    </feComponentTransfer>
  );
  /* N_R < N_G < N_B → red bends most, blue least.
     ---------------------------------------------------------------------------
     ALPHA. Compositing is premultiplied, so summing three channel-isolated layers
     sums their alphas too: a pixel of alpha a came out at min(3a, 1). On an opaque
     source that clamps harmlessly, but this element is mostly translucent (a 6-14%
     white fill, plus anti-aliased glyph edges), so it inflated the fill's opacity
     and hardened every glyph edge into a hard stair — which is what showed up as
     pixelation once the roll-off stretched that content 10x.

     Fixed by pre-dividing each layer's alpha by three, then restoring RGB by three
     at the end. feComponentTransfer and feColorMatrix both work on
     NON-premultiplied values, so:

        layer         (R, 0, 0, a/3)   premultiplied (Ra/3, 0, 0, a/3)
        sum           (Ra/3, Ga/3, Ba/3, a)
        un-premult    (R/3, G/3, B/3)      x3 -> (R, G, B) with alpha a

     Exact, and nothing clamps on the way: alpha tops out at a, channels at 1/3. */
  const dispersive = (from: string, scale: number, sp: number, out?: string) => (
    <>
      {pass("dR", from, scale * sp)}
      {pass("dG", from, scale)}
      {pass("dB", from, scale / sp)}
      {only("dR", "cR", 0)}
      {only("dG", "cG", 1)}
      {only("dB", "cB", 2)}
      {third("cR", "aR")}
      {third("cG", "aG")}
      {third("cB", "aB")}
      {add("aR", "aG", "cRG")}
      {add("cRG", "aB", "cSum")}
      <feColorMatrix
        in="cSum"
        result={out}
        type="matrix"
        values="3 0 0 0 0  0 3 0 0 0  0 0 3 0 0  0 0 0 1 0"
      />
    </>
  );

  return (
    <svg className="glass-defs" aria-hidden focusable="false">
      <filter id={PILL_GLASS_ID} {...region(pad)}>
        {mapImage(map, pad, "map")}
        {dispersive("map", base, spread)}
      </filter>

      <filter id={PILL_TEXT_ID} {...region(textPad)}>
        {/* The map is 8-bit, so each pixel's displacement is quantised to
            textBase/255 ~ 0.23px. Harmless on its own — but the roll-off stretches
            that content up to 14x, and it magnifies the quantisation staircase
            just as much, which reads as ragged, stepped glyph edges in the band. A
            ~1px blur averages neighbouring samples back into a continuous ramp,
            effectively buying a couple of bits of precision. Gaussian smoothing
            cannot introduce a new extremum in 1-D, so a monotonic field stays
            monotonic and this cannot reintroduce the reversed-direction bug. */}
        {mapImage(textMap, textPad, "mSraw")}
        <feGaussianBlur in="mSraw" stdDeviation={MAP_SMOOTH} result="mS" />
        {mapImage(rimMap, textPad, "mRim")}
        {/* The text: one plain pass everywhere, with the dispersed pass laid over
            it ONLY inside the bend zone (mS's B channel as an alpha mask). The
            split was already ~0.006px mid-line, since it scales with the local
            displacement — but that was incidental, and this makes it exact.

            It also keeps the centre off the three-pass path, which matters for
            more than colour: summing three channel-isolated layers adds their
            alphas, and this element's source is mostly translucent (a 6-14% white
            fill), so that path inflates the fill's opacity. Confining it to the
            thin edge zone confines that artifact too. */}
        {pass("bodyPlain", "mS", textBase)}
        {dispersive("mS", textBase, textSpread, "bodyDisp")}
        {/* The map is 8-bit, so its quantum is textBase/255 — and textBase roughly
            tripled when the roll-off merged into this channel, taking the quantum
            from 0.09px to 0.22px. A sub-pixel fringe spanning only a few quanta
            separates into visible steps, so the colour split had started to band
            rather than blend. A hair of blur on the dispersed pass only (the plain
            body underneath stays sharp) puts the gradient back. */}
        <feGaussianBlur
          in="bodyDisp"
          stdDeviation={0.4}
          result="bodyDispSoft"
        />
        <feColorMatrix
          in="mS"
          result="zone"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0"
        />
        <feComposite
          in="bodyDispSoft"
          in2="zone"
          operator="in"
          result="bodyDispZ"
        />
        {/* ...and that is the whole graph. The edge roll-off used to be a fourth
            and fifth stage here — displace, blur twice, mask, fade to 55%, draw
            over the body — and laying a semi-opaque sheet over part of the glass
            is what made that band read as a separate pane. It now lives in mS as
            pure displacement, so it is the same single surface as everything
            else. Two maps deleted with it (reflection + cap weight), along with
            two feImages, two blurs and four composites. */}
        <feComposite
          in="bodyDispZ"
          in2="bodyPlain"
          operator="over"
          result="body"
        />
        {/* Rim softening. The band is squeezed thin against the edge, and a thin
            hard-edged smear reads as an artifact — blurring only that strip is what
            makes it a wisp. Both inputs are the same opaque body, cross-faded, so
            this is still one surface rather than a pane laid over it. */}
        <feGaussianBlur in="body" stdDeviation={RIM_BLUR} result="bodySoft" />
        <feComposite
          in="bodySoft"
          in2="mRim"
          operator="in"
          result="bodySoftRim"
        />
        {/* The top-edge scrim is NOT here. It has to fade in when you start typing,
            and a filter primitive's attributes are not CSS properties, so nothing
            inside this graph can be transitioned. It lives on
            `.prompt--dock::before` instead — above the filtered pill, so it is
            neither displaced nor smeared, and animatable. */}
        <feComposite in="bodySoftRim" in2="body" operator="over" />
      </filter>
    </svg>
  );
}
