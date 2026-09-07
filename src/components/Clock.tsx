import { useEffect, useRef, type CSSProperties } from "react";
import DialMorph from "./DialMorph";
import { fieldAt } from "../lib/dialField";
import "./Clock.css";

const REFRACT_MAP = "/icons/clock-refract.png";

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
// The classic detail from the reference: a 5..60 track just inside the rim.
const MIN_LABELS = Array.from({ length: 12 }, (_, i) => (i + 1) * 5);

// The dial's starting pose. 10:10 is the convention for presenting a clock face —
// the hands sit symmetrically, clear of the numerals and the brand line — and at
// exactly 10:10:00 the second hand is already at twelve, which is where it should
// start from. Running the whole clock from this offset rather than pinning the hour
// and minute hands keeps the face coherent: they creep forward together instead of
// standing still while the second hand laps them.
const POSE_SECONDS = 10 * 3600 + 10 * 60;

// Everything is laid out on a 1000-unit square so the radii below read as
// percentages of the diameter, whatever size the clock is rendered at.
const C = 500;
const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

// The dial's box inside the 1000-unit viewBox: r=447 about the centre, so 53..947.
// The morph canvas covers exactly this, which is what lets a point on the dial be
// converted into a point in the noise field.
const DIAL_MIN = 53;
const DIAL_SPAN = 894;

/**
 * Where this element sits in the dissolve, 0 to 1 — the value the shader will
 * threshold at that same point.
 *
 * This is the whole reason the field is baked in JS rather than computed in GLSL:
 * each numeral, bar, tick and hand turns silver at the instant the photograph
 * reaches it, because both are reading the same number. A stagger by angle or by
 * index would also go "one at a time", but it would go round the dial while the
 * image came in in tendrils, and every element that changed early over ground the
 * image had not covered yet would give it away.
 *
 * v is flipped because the field is stored with row 0 at the bottom, the way a
 * texture is sampled, while the viewBox counts y downward.
 */
const lit = (x: number, y: number): CSSProperties =>
  ({
    "--i": fieldAt((x - DIAL_MIN) / DIAL_SPAN, 1 - (y - DIAL_MIN) / DIAL_SPAN).toFixed(4),
  }) as CSSProperties;

/**
 * Analogue wall clock.
 *
 * It does NOT show wall-clock time. `epoch` is the moment the clock was started,
 * and every hand is derived from the time elapsed since — so the face reads 10:10:00
 * at the instant the section is entered and runs forward from there, with the second
 * hand leaving twelve. `epoch: null` parks it on that pose. That is the point of the
 * section: the clock starts when you arrive, rather than telling you the time.
 *
 * Drawn as SVG rather than the WebGL scene at clock3d.vercel.app: that app ships
 * no source or licence, and the brief was for a flatter, more classic face than it
 * renders anyway. Proportions follow the clock in the homepage frames — bezel
 * ~5% of the diameter, silver dial with a diagonal gradient — and the dial detail
 * (minute track with 5..60 numerals, tapered hands, red sweep second) follows the
 * reference photo.
 *
 * Hand angles are written as custom properties on the root and applied in CSS, so
 * ticking the clock never touches the DOM structure — only three numbers.
 */
export default function Clock({
  label = "QUANTHIVE",
  epoch = null,
  morphRef = null,
  src,
}: {
  label?: string;
  /** ms timestamp the clock runs from; null parks it on the 10:10 pose. */
  epoch?: number | null;
  /** Which photograph this clock's dial becomes. Defaults to the first. */
  src?: string;
  /**
   * How far the dial has turned into the photograph, 0 to 1, read every frame.
   * Omit it and the clock is just a clock.
   */
  morphRef?: { current: number } | null;
}) {
  const rootRef = useRef<SVGSVGElement>(null);
  // Held in a ref rather than an effect dependency: a reset should restart the
  // hands, not tear down and rebuild the frame loop and its observer.
  const epochRef = useRef(epoch);
  const restartRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    epochRef.current = epoch;
    // Kick the loop: it stops itself while parked, so setting an epoch has to
    // restart it rather than wait for the next visibility change.
    restartRef.current?.();
  }, [epoch]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    let disposed = false;

    const tick = () => {
      const started = epochRef.current;
      // Continuous, not stepped: a sweep second hand reads as mechanical, and it
      // also means the hour and minute hands creep rather than jumping on the
      // minute, which is what makes an analogue face look alive.
      const elapsed = started === null ? 0 : Math.max(0, (Date.now() - started) / 1000);
      const t = POSE_SECONDS + elapsed;
      root.style.setProperty("--clk-s", `${(t % 60) * 6}deg`);
      root.style.setProperty("--clk-m", `${((t / 60) % 60) * 6}deg`);
      root.style.setProperty("--clk-h", `${((t / 3600) % 12) * 30}deg`);
      // Parked: draw the one frame and stop. There is no separate
      // visibility observer — being armed IS being on screen, because the section
      // parks the clock the moment it scrolls away, and an observer racing the
      // arming effect would stop the hands before they had run a frame.
      raf = !disposed && started !== null ? requestAnimationFrame(tick) : 0;
    };

    restartRef.current = () => {
      if (!raf) tick();
    };
    tick();

    return () => {
      disposed = true;
      restartRef.current = null;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg
      className="clk"
      viewBox="0 0 1000 1000"
      ref={rootRef}
      role="img"
      aria-label="Analogue clock, running from the moment this section was reached"
    >
      <defs>
        <linearGradient id="clk-bezel" x1="0.14" y1="0" x2="0.86" y2="1">
          <stop offset="0" stopColor="#7c7c7c" />
          <stop offset="0.22" stopColor="#2b2b2b" />
          <stop offset="0.55" stopColor="#0b0b0b" />
          <stop offset="0.82" stopColor="#242424" />
          <stop offset="1" stopColor="#4a4a4a" />
        </linearGradient>
        {/* The dial's diagonal silver, matching the frames. */}
        <linearGradient id="clk-face" x1="0.08" y1="0" x2="0.92" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.34" stopColor="#f2f2f2" />
          <stop offset="0.68" stopColor="#cfcfcf" />
          <stop offset="1" stopColor="#9e9e9e" />
        </linearGradient>
        <radialGradient id="clk-vignette" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.72" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
        </radialGradient>

        {/* The cover glass, as an actual refraction rather than a painted-on
            shine. clock-refract.png encodes the slope of a domed crystal in its
            R/G channels — flat across the middle, rising steeply at the rim — and
            three displacement passes at slightly different scales split red from
            blue, which is the chromatic dispersion real glass has. The channels
            are then isolated and summed back together.

            userSpaceOnUse with an explicit 0..1000 region so the map lands on the
            dial exactly; the default bbox units would fit it to the filtered
            group's bounds, which move as the hands sweep. */}
        <filter
          id="clk-refract"
          filterUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="1000"
          height="1000"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={REFRACT_MAP}
            x="0"
            y="0"
            width="1000"
            height="1000"
            preserveAspectRatio="none"
            result="lens"
          />
          <feDisplacementMap in="SourceGraphic" in2="lens" scale="21" xChannelSelector="R" yChannelSelector="G" result="dR" />
          <feDisplacementMap in="SourceGraphic" in2="lens" scale="17" xChannelSelector="R" yChannelSelector="G" result="dG" />
          <feDisplacementMap in="SourceGraphic" in2="lens" scale="13" xChannelSelector="R" yChannelSelector="G" result="dB" />
          <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cR" />
          <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cG" />
          <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cB" />
          <feComposite in="cR" in2="cG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="cRG" />
          <feComposite in="cRG" in2="cB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>

        {/* Fresnel: glass reflects almost nothing head-on and a great deal at a
            grazing angle, so the rim carries nearly all of it. */}
        <radialGradient id="clk-fresnel" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.78" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.93" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.985" stopColor="#ffffff" stopOpacity="0.46" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </radialGradient>

        {/* The broad window reflection sitting on the crystal. */}
        <linearGradient id="clk-spec" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.13" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        <clipPath id="clk-dial-clip">
          <circle cx={C} cy={C} r="447" />
        </clipPath>
      </defs>

      {/* bezel, then a dark lip, then the dial */}
      <circle cx={C} cy={C} r="497" fill="url(#clk-bezel)" />
      <circle cx={C} cy={C} r="455" fill="#0a0a0a" />
      <circle cx={C} cy={C} r="447" fill="url(#clk-face)" />
      <circle cx={C} cy={C} r="447" fill="url(#clk-vignette)" />

      {/* The photograph the dial turns into, laid straight over the dial face and
          under everything below — so the minute track, the numerals, the hands and
          the crystal's own reflections all keep painting on top of it and the clock
          goes on working while its background changes underneath.

          A foreignObject because the morph is a shader and a shader needs a canvas.
          Its box is the dial exactly: r=447 of the 1000-unit viewBox, so 53..947.
          Deliberately OUTSIDE the refraction group below — the displacement map
          re-runs whenever its input changes, and putting a canvas that repaints
          every frame inside it would re-run three displacement passes over the
          whole dial per frame for a distortion the eye cannot separate from the
          crystal highlights that already sit over the top of it. */}
      {morphRef ? (
        <foreignObject x="53" y="53" width="894" height="894">
          <DialMorph qRef={morphRef} src={src} />
        </foreignObject>
      ) : null}

      {/* Everything from here to the hub sits UNDER the crystal, so it is what the
          refraction acts on. The bezel and lip above are outside the glass. */}
      <g filter="url(#clk-refract)">
        {/* minute track */}
        <circle
          className="clk__track"
          cx={C}
          cy={C}
          r="432"
          fill="none"
          stroke="#b9b9b9"
          strokeWidth="1.5"
        />
        <g className="clk__ticks" stroke="#6f6f6f">
          {MINUTES.map((i) => {
            const onFive = i % 5 === 0;
            const [x1, y1] = polar(i * 6, 430);
            const [x2, y2] = polar(i * 6, onFive ? 408 : 418);
            const [mx, my] = polar(i * 6, 420);
            return (
              <line
                key={i}
                className="clk__lit"
                style={lit(mx, my)}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={onFive ? 5 : 2}
                strokeLinecap="butt"
              />
            );
          })}
        </g>

        <g className="clk__minlabels" fill="#7b7b7b">
          {MIN_LABELS.map((n) => {
            const [x, y] = polar(n * 6, 388);
            return (
              <text key={n} className="clk__lit" style={lit(x, y)} x={x} y={y}>
                {n}
              </text>
            );
          })}
        </g>

        {/* hour bars, sitting outside the numerals as they do on the reference */}
        <g className="clk__bars" fill="#3a3a3a">
          {HOURS.map((n) => {
            const [x, y] = polar(n * 30, 340);
            return (
              <rect
                key={n}
                className="clk__lit"
                style={lit(x, y)}
                x={x - 11}
                y={y - 30}
                width="22"
                height="60"
                rx="2"
                transform={`rotate(${n * 30} ${x} ${y})`}
              />
            );
          })}
        </g>

        <g className="clk__hours" fill="#3d3d3d">
          {HOURS.map((n) => {
            const [x, y] = polar(n * 30, 258);
            return (
              <text key={n} className="clk__lit" style={lit(x, y)} x={x} y={y}>
                {n}
              </text>
            );
          })}
        </g>

        <text className="clk__brand clk__lit" style={lit(C, 642)} x={C} y="642" fill="#8d8d8d">
          {label}
        </text>

        {/* hands — angles come from --clk-* on the root. They sweep the whole dial,
            so there is no one point in the field that is theirs; they take the
            centre's, which puts their change in the middle of the transition. */}
        <g className="clk__hand clk__hand--hour clk__lit" style={lit(C, C)}>
          <polygon points="500,268 517,470 500,500 483,470" fill="#141414" />
          <polygon points="500,500 507,548 493,548" fill="#141414" />
        </g>
        <g className="clk__hand clk__hand--min clk__lit" style={lit(C, C)}>
          <polygon points="500,120 513,468 500,500 487,468" fill="#141414" />
          <polygon points="500,500 506,556 494,556" fill="#141414" />
        </g>
        <g className="clk__hand clk__hand--sec">
          <line x1={C} y1="590" x2={C} y2="108" stroke="#a81d1b" strokeWidth="5" />
          <circle cx={C} cy="590" r="14" fill="#a81d1b" />
        </g>

        <circle className="clk__hub clk__lit" style={lit(C, C)} cx={C} cy={C} r="19" fill="#141414" />
        <circle cx={C} cy={C} r="7" fill="#a81d1b" />
      </g>

      {/* --- the crystal ------------------------------------------------------
          Reflections only; the refraction above is what makes it read as glass.
          The specular group shifts with the pointer (--clk-gx/gy, written by the
          tilt handler), because a highlight that stays put while the object turns
          is the thing that gives a fake glass away. */}
      <g clipPath="url(#clk-dial-clip)">
        <g className="clk__spec">
          <ellipse
            cx="352"
            cy="318"
            rx="286"
            ry="196"
            fill="url(#clk-spec)"
            transform="rotate(-34 352 318)"
          />
          <ellipse cx="690" cy="704" rx="150" ry="96" fill="url(#clk-spec)" transform="rotate(-34 690 704)" opacity="0.42" />
        </g>
        <circle cx={C} cy={C} r="447" fill="url(#clk-fresnel)" />
      </g>
    </svg>
  );
}
