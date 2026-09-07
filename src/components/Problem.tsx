import { useEffect, useRef, useState } from "react";
import Clock from "./Clock";
import MatrixText from "./MatrixText";
import ClockGlow, { type GlassLight } from "./ClockGlow";
import MetalSurface from "./MetalSurface";
import "./Problem.css";

// How quickly the eased progress chases the raw scroll position, in seconds. Small
// enough to feel attached to the wheel, large enough to smooth a trackpad's jitter.
const EASE_TAU = 0.11;

// Hover tilt on the clock. Kept very shallow — at the size the clock settles to,
// anything past a couple of degrees stops reading as a solid object catching the
// light and starts reading as a card being waggled.
const TILT_DEG = 2.4;
const SHIFT_PX = 4;
// Glare travel, in the clock's own 1000-unit viewBox space.
const GLARE_X = 70;
const GLARE_Y = 52;

// The bezel, run through the same liquid-metal shader as the lockup. Its mask is
// an annulus padded by 40 of 1080 units, so the overlay has to be 1.08x the clock
// and inset by -4% for the artwork to land on the bezel exactly (see the SVG).
const BEZEL_SRC = "/icons/clock-bezel.svg";
const BEZEL_ART_SHARE = 1000 / 1080;
// The ring is 42 units thick, so a bevel just under half of that rolls it into a
// tube — which is what a turned metal bezel looks like.
const BEZEL_BEVEL = 0.019;

// The motifs are fully back to stainless at 99% of the clock's shrink, so the
// material has settled by the time the clock has.
const RELIGHT_AT = 0.99;

// The "title and caption" group of frame 1894:44 (node 1897:1078), verbatim. The
// order is the frame's, not the reading you might expect from the names: "hours
// lost." is the upper line at y=867 in a 45-unit box, and the longer line sits
// under it at y=918 in a 21-unit one.
const FOOT_TITLE = "hours lost."; // 1895:995
const FOOT_CAPTION = "Endless Sources. Endless Research."; // 1895:986

// Frame 1900:1079. The apostrophe is the typographic one the copy is set with, not
// the straight quote — they are different characters and the serif draws them
// differently.
const FOOT_TITLE_2 = "Markets Don’t Wait.";
const FOOT_CAPTION_2 = "The Market Never Pauses";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Phase three's sub-tracks, all cut out of one 0..1.
 *
 * They overlap on purpose — the brief is that the second clock arrives WHILE the
 * first is still leaving, and that the line has finished changing by the time it
 * settles. Writing them as windows on a shared progress is what makes those
 * relationships legible and adjustable; as separate timers they would drift.
 */
const HANDOFF = {
  /** The first clock's run to the left. */
  exit: [0.0, 0.55],
  /** ...and its coming apart, starting once it is already moving. */
  fade: [0.1, 0.5],
  /** The second photograph's approach from the right. Starts before the first has
   *  finished leaving, so the two are on the dial together through the middle. */
  enter: [0.28, 0.88],
  /** The metal changing, on the new clock and the ornaments together. */
  alloy: [0.3, 0.85],
  /** The line alternating over. Ends before `enter` does, so the text has settled
   *  by the time the clock reaches its mark. */
  swap: [0.18, 0.78],
} as const;

const track = (v: number, w: readonly [number, number]) => clamp01((v - w[0]) / (w[1] - w[0]));

/**
 * "The Problem" — frames 1886:87160 (entry) and 1886:87496 (settled).
 *
 * One sticky stage over a tall section. Scroll progress through the section drives
 * a single `--p` (0 to 1); the clock reads it for both its scale and its vertical
 * centre, so it starts oversized with only its top showing above the fold and ends
 * small and centred, exactly as the two frames have it — and stays there, running,
 * for as long as you leave it.
 */
export default function Problem({
  recessed = false,
  toneRef,
  alloyRef: alloyOut,
}: {
  /** The menu is down: the clock pulls back from the viewer, as the hero does. */
  recessed?: boolean;
  /** Written every frame: 0 = stainless, 1 = graphite. Read by the edge motifs. */
  toneRef?: { current: number };
  /** Written every frame: 0 = as the tone left it, 1 = OCEAN. Also the motifs'. */
  alloyRef?: { current: number };
}) {
  const sectionRef = useRef<HTMLElement>(null);
  // The moment the clock was started, or null while parked on its 10:10 pose.
  // Re-armed on every arrival, so scrolling away and back restarts it rather than
  // resuming it.
  const [clockEpoch, setClockEpoch] = useState<number | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let current = 0;
    let target = 0;
    // Phase two, after the clock has arrived: the dial turns into the photograph.
    // Its own eased track, because it is driven by scroll the clock no longer
    // responds to — everything about the clock is finished at --p 1.
    let curQ = 0;
    let targetQ = 0;
    // Phase three: the handoff from the first clock to the second.
    let curR = 0;
    let targetR = 0;
    let running = false;
    let inside = false;
    // Second eased track: how far the hero has been scrolled off, 0 to 1. The
    // motifs darken across it and light back up across the section's own progress.
    let curV = 0;
    let targetV = 0;

    // Arming the clock is driven from the scroll position, not an
    // IntersectionObserver. This section's top sits flush against the viewport's
    // bottom edge at scroll 0, and a zero-area intersection at that boundary is
    // reported inconsistently — so the observer never saw the section LEAVE, and
    // coming back resumed the hands instead of restarting them. Two thresholds
    // with a gap between them make both transitions unambiguous.
    const ENTER = 0.9; // section top has risen a tenth of a viewport
    const LEAVE = 0.99;

    const measure = () => {
      const rect = section.getBoundingClientRect();
      // Two phases of one viewport each, measured off the raw scroll rather than
      // split out of a single 0..1 over the whole section: that way the first phase
      // is unchanged by the second existing at all, and adding travel to the end
      // cannot quietly restretch the clock's approach.
      const vh = window.innerHeight;
      const scrolled = -rect.top;
      target = clamp01(scrolled / vh);
      targetQ = clamp01((scrolled - vh) / vh);
      targetR = clamp01((scrolled - 2 * vh) / vh);

      targetV = Math.min(1, Math.max(0, 1 - rect.top / window.innerHeight));

      const frac = rect.top / window.innerHeight;
      if (!inside && frac < ENTER) {
        inside = true;
        setClockEpoch(Date.now());
      } else if (inside && frac > LEAVE) {
        inside = false;
        setClockEpoch(null); // park on the pose, which also stops its frame loop
      }
    };

    const write = (v: number) => {
      current = v;
      section.style.setProperty("--p", v.toFixed(4));
      // Also on the document element, because the edge motifs shrink with the
      // clock on a phone and they are a fixed sibling of this section rather than
      // a child — there is no other element both can see. Whether anything acts on
      // it is CSS's business: only the mobile block in EdgeMotifs.css reads it, so
      // a desktop pays nothing for this beyond the write itself.
      document.documentElement.style.setProperty("--prob-p", v.toFixed(4));
    };

    const writeQ = (v: number) => {
      curQ = v;
      morphRef.current = v;
      // Mirrored into the DOM as well: the shader reads the ref, but the number has
      // to be inspectable, and nothing about a dissolve can be read back out of the
      // pixels it produces.
      section.style.setProperty("--q", v.toFixed(4));
    };

    const writeR = (v: number) => {
      curR = v;
      section.style.setProperty("--r", v.toFixed(4));
      // The border lines hand over during this phase and they live on the fixed
      // ornament layer, outside this section — same reason --prob-p is published.
      document.documentElement.style.setProperty("--prob-r", v.toFixed(4));

      // Accelerating away: squared rather than linear, so the picture creeps off its
      // mark and is moving fastest at the moment it stops being there to watch.
      const e1 = track(v, HANDOFF.exit);
      outRef.current = e1 * e1;

      // Decelerating in, the same curve read backwards — it arrives fast and settles
      // rather than coasting in at a constant rate.
      const e2 = track(v, HANDOFF.enter);
      inRef.current = 1 - (1 - e2) * (1 - e2);

      alloyRef.current = track(v, HANDOFF.alloy);
      section.style.setProperty("--alloy", alloyRef.current.toFixed(4));
      swapRef.current = track(v, HANDOFF.swap);
    };

    // Darkens as the hero scrolls off, then lights back up across the section's
    // own progress. RELIGHT_AT is short of 1 on purpose: the material should be
    // fully back to stainless once the clock has all but finished shrinking, not
    // at the very last frame of the scroll.
    const writeTone = (v: number, p: number) => {
      const relit = Math.min(1, p / RELIGHT_AT);
      const tone = v * (1 - relit);
      if (toneRef) toneRef.current = tone;
      // Mirrored onto the section as well. The shader reads the ref, but having
      // the number in the DOM makes it inspectable — the motifs' banding animates,
      // so you cannot read the blend back out of their pixels.
      section.style.setProperty("--tone", tone.toFixed(4));
    };

    const frame = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      // Frame-rate independent easing, same as the specular's: identical glide on a
      // 60Hz and a 120Hz display, and no lurch after a dropped frame.
      const k = 1 - Math.exp(-dt / EASE_TAU);
      const next = current + (target - current) * k;
      curV += (targetV - curV) * k;
      write(next);
      writeQ(curQ + (targetQ - curQ) * k);
      writeR(curR + (targetR - curR) * k);
      writeTone(curV, next);
      if (
        Math.abs(target - next) < 0.0004 &&
        Math.abs(targetV - curV) < 0.0004 &&
        Math.abs(targetQ - curQ) < 0.0004 &&
        Math.abs(targetR - curR) < 0.0004
      ) {
        curV = targetV;
        write(target);
        writeQ(targetQ);
        writeR(targetR);
        writeTone(curV, target);
        raf = 0;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      measure();
      if (reduceMotion.matches) {
        // no easing to chase; land on the values immediately
        curV = targetV;
        write(target);
        writeQ(targetQ);
        writeR(targetR);
        writeTone(curV, target);
        return;
      }
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    measure();
    curV = targetV;
    write(target);
    writeQ(targetQ);
    writeR(targetR);
    writeTone(curV, target);
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);

    return () => {
      cancelAnimationFrame(raf);
      // Published outside this section, so it has to be taken back by hand.
      document.documentElement.style.removeProperty("--prob-p");
      document.documentElement.style.removeProperty("--prob-r");
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
    };
  }, [toneRef]);

  // Pointer tilt on the clock. It writes custom properties rather than setting a
  // transform string, so the CSS keeps ownership of the rest pose and the two
  // never fight; the same values also drive the crystal's specular, which is what
  // sells the glass — a highlight that ignores the tilt reads as a sticker.
  const caseRef = useRef<HTMLDivElement>(null);
  // Where the light sits on the crystal, and how strongly. Written by the pointer
  // handler below, read every frame by the glow pass.
  const lightRef = useRef<GlassLight>({ x: 0, y: 0, hover: 0 });
  // The second clock gets the same treatment and its own light: sharing one would
  // slide the highlight across BOTH crystals whichever you were pointing at.
  const caseTwoRef = useRef<HTMLDivElement>(null);
  const lightTwoRef = useRef<GlassLight>({ x: 0, y: 0, hover: 0 });
  // Phase two's progress, read by the dial's shader every frame it draws.
  const morphRef = useRef(0);
  // Phase three. The clock itself does not move: `out` slides the first photograph
  // off the dial and takes it apart, `in` brings the second across from the right,
  // alloy carries the bezel and the edge ornaments over to the new metal, and swap
  // runs the line under it over to its new copy.
  const outRef = useRef(0);
  const inRef = useRef(0);
  const ownAlloyRef = useRef(0);
  // The ornaments live outside this section, so their copy of the value is passed
  // down from App; this falls back to a local one when it is rendered without.
  const alloyRef = alloyOut ?? ownAlloyRef;
  const swapRef = useRef(0);
  useEffect(() => {
    // Bound to each clock in turn rather than to the first one only. They are never
    // both under the pointer — one is leaving as the other arrives — but the second
    // is what you are left looking at, and a clock that ignores the cursor after the
    // one before it did not reads as a picture of a clock.
    const bind = (el: HTMLDivElement | null, light: { current: GlassLight }) => {
      if (!el) return () => {};

    let raf = 0;
    let nx = 0;
    let ny = 0;

    const apply = () => {
      raf = 0;
      el.style.setProperty("--tilt-x", `${(-ny * TILT_DEG).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(nx * TILT_DEG).toFixed(2)}deg`);
      el.style.setProperty("--shift-x", `${(nx * SHIFT_PX).toFixed(2)}px`);
      el.style.setProperty("--shift-y", `${(ny * SHIFT_PX).toFixed(2)}px`);
      // Counter-moving, and much further than the body. A reflection lives on the
      // surface, so it slides across the dial as the face turns under it — and it
      // is deliberately not scaled down as far as the tilt was, because a
      // reflection's travel is far more sensitive to angle than a silhouette's.
      // Damp this to match the tilt and the glass stops reading as glass.
      el.style.setProperty("--clk-gx", `${(-nx * GLARE_X).toFixed(1)}`);
      el.style.setProperty("--clk-gy", `${(-ny * GLARE_Y).toFixed(1)}`);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
      ny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2));
      // The glow's light goes to the cursor itself, not the damped tilt: it is a
      // reflection of something in the room, so it belongs where you are pointing.
      light.current.x = nx;
      light.current.y = ny;
      light.current.hover = 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      light.current.hover = 0;
      // Clear rather than zero, so the CSS rest values apply and the ease-out
      // transition there governs the way back.
      for (const k of ["--tilt-x", "--tilt-y", "--shift-x", "--shift-y", "--clk-gx", "--clk-gy"]) {
        el.style.removeProperty(k);
      }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
      return () => {
        cancelAnimationFrame(raf);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      };
    };

    const offOne = bind(caseRef.current, lightRef);
    const offTwo = bind(caseTwoRef.current, lightTwoRef);
    return () => {
      offOne();
      offTwo();
    };
  }, []);

  return (
    <section className="prob" ref={sectionRef} data-recessed={recessed || undefined}>
      <div className="prob__stage">
        <div className="prob__head">
          <h2 className="prob__title">
            <span className="prob__title-text">The Problem</span>
            {/* Paints the page ground back over the letters — see the SVG. */}
            <span className="prob__strike" aria-hidden />
          </h2>
          <p className="prob__sub">Time is precious</p>
        </div>

        {/* Arrives under the clock as the dial finishes turning into the
            photograph — see --q, and the reveal window in Problem.css. */}
        <div className="prob__foot">
          <p className="prob__foot-title">
            <MatrixText from={FOOT_TITLE} to={FOOT_TITLE_2} progressRef={swapRef} />
          </p>
          <p className="prob__foot-caption">
            <MatrixText from={FOOT_CAPTION} to={FOOT_CAPTION_2} progressRef={swapRef} />
          </p>
        </div>

        <div className="prob__clock">
          {/* Three nested elements, one transform each, because all three change on
              different clocks and a single transform can only be owned by one of
              them: .prob__clock is the scroll-driven travel and scale, rewritten
              every frame from --p; .clock-recess is the menu, which is a CSS
              transition and would fight that per-frame write; .clock-case is the
              hover tilt, set from the pointer handler. */}
          <div className="clock-recess">
            <div className="clock-case" ref={caseRef}>
              <Clock
                epoch={clockEpoch}
                morphRef={morphRef}
                outRef={outRef}
                inRef={inRef}
              />
              {/* Above the dial's refraction, below the bezel: it is light on the
                  crystal, and the shader clips it to the dial. */}
              <ClockGlow className="clock-glow" lightRef={lightRef} />
              {/* Fades in with --p, so the bezel only turns to metal as the clock
                  shrinks toward the centre. */}
              <MetalSurface
                className="clock-bezel"
                src={BEZEL_SRC}
                artHeightShare={BEZEL_ART_SHARE}
                bevelFrac={BEZEL_BEVEL}
                trackPointer={false}
                alloyRef={alloyRef}
                aria-hidden
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
