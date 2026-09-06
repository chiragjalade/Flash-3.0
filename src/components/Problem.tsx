import { useEffect, useRef, useState } from "react";
import Clock from "./Clock";
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
}: {
  /** The menu is down: the clock pulls back from the viewer, as the hero does. */
  recessed?: boolean;
  /** Written every frame: 0 = stainless, 1 = graphite. Read by the edge motifs. */
  toneRef?: { current: number };
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
      // The scrollable travel is the section's height less one viewport, which is
      // exactly how far it moves while the sticky stage is pinned.
      const range = section.offsetHeight - window.innerHeight;
      target = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0;

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
      writeTone(curV, next);
      if (Math.abs(target - next) < 0.0004 && Math.abs(targetV - curV) < 0.0004) {
        curV = targetV;
        write(target);
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
    writeTone(curV, target);
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);

    return () => {
      cancelAnimationFrame(raf);
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
  useEffect(() => {
    const el = caseRef.current;
    if (!el) return;

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
      lightRef.current.x = nx;
      lightRef.current.y = ny;
      lightRef.current.hover = 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      lightRef.current.hover = 0;
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

        <div className="prob__clock">
          {/* Three nested elements, one transform each, because all three change on
              different clocks and a single transform can only be owned by one of
              them: .prob__clock is the scroll-driven travel and scale, rewritten
              every frame from --p; .clock-recess is the menu, which is a CSS
              transition and would fight that per-frame write; .clock-case is the
              hover tilt, set from the pointer handler. */}
          <div className="clock-recess">
            <div className="clock-case" ref={caseRef}>
              <Clock epoch={clockEpoch} />
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
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
