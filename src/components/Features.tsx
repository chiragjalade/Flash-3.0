import { useEffect, useRef } from "react";
import CenterGlass from "./CenterGlass";
import "./Features.css";

// Same chase constant as Problem's: the two sections are one continuous scroll and
// a different time constant would make the handover feel like a seam.
const EASE_TAU = 0.11;

/** Viewports of pinned travel the choreography runs across, after the page has
 *  arrived. The section is one taller than this — the extra one is the rise.
 *  Mirrored in Features.css, which sizes the section from it. */
const STAGE_VH = 2;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const SETUP_SRC = "/images/flash-setup.png";
const CENTER_BG_SRC = "/images/page3-center-bg.jpg";
const SETUP_BKG_SRC = "/icons/flash-setup-bkg.svg";
const WORDMARK_SRC = "/icons/flash-wordmark.svg";

/** The page title, 1722:52 — set the same way "The Problem" is on the section
 *  above, box rule and torn strike included, because the frame draws it with the
 *  same nodes. */
const TITLE = "The Solution";

/** 1722:66, verbatim. Upper-cased in CSS rather than here, the way the problem
 *  section's caption is, so the string stays the copy as written. */
const FOOT_CAPTION = "from intelligence to decision. in minutes";

/** 1722:157 and its three copies. The frame repeats one string across all four
 *  boxes — including its typo — so the four are one constant rather than four. */
const BOX_TEXT = ["From Intelligence to dicision, in minutes", "on the edge *"] as const;
const BOX_COUNT = 4;

/**
 * "The Solution" — frame 1722:3.
 *
 * The page rises over the problem section rather than replacing it: nothing here is
 * fixed, so the sticky stage the clock was pinned to simply unpins at the end of its
 * travel and scrolls away under this. The edge ornaments and their border line stay
 * put through all of it because they were never part of either section — they are a
 * fixed sibling of both, painted at z-index 0 with both sections transparent above
 * them. The frame agrees: it draws the same two ornaments and the same two border
 * lines at the same coordinates page two puts them at.
 *
 * The choreography is scroll-driven for the same reason phases one to four are: the
 * brief asks for it to run backwards when the user scrolls back up, and a timeline
 * that is a pure function of scroll position does that for free, whereas one started
 * by an IntersectionObserver has to be torn down and rewound by hand.
 */
export default function Features() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let curRise = 0;
    let targetRise = 0;
    let curF = 0;
    let targetF = 0;
    let running = false;

    const measure = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      // Two tracks off the raw offset, not one split in half. `rise` is the page
      // coming up over the problem section — it finishes exactly as the section's
      // top reaches the viewport's, which is the moment the brief calls "occupies
      // full viewport". `f` is everything after that, and starts from zero there,
      // so retiming the entrance cannot shift the choreography behind it.
      targetRise = clamp01(1 - rect.top / vh);
      targetF = clamp01(-rect.top / (STAGE_VH * vh));
    };

    const write = () => {
      section.style.setProperty("--rise", curRise.toFixed(4));
      section.style.setProperty("--f", curF.toFixed(4));
      // Also on the document element: the abstract lines are fixed to the viewport
      // and so are a sibling of this section rather than a child, and there is no
      // other element both can see. One continuous scalar across both tracks — 0 to
      // 1 as the page rises, then 1 to 2 across the pinned travel — because --f is
      // zero for the whole of the rise and cannot express anything starting inside
      // it. What reads it is CSS's business; see AbstractLines.css.
      document.documentElement.style.setProperty(
        "--feat-through",
        (curRise + curF).toFixed(4),
      );
    };

    const frame = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      // Frame-rate independent: the same fraction of the remaining distance per
      // second whatever the display is running at.
      const k = 1 - Math.exp(-dt / EASE_TAU);
      curRise += (targetRise - curRise) * k;
      curF += (targetF - curF) * k;
      write();
      if (Math.abs(targetRise - curRise) < 0.0002 && Math.abs(targetF - curF) < 0.0002) {
        curRise = targetRise;
        curF = targetF;
        write();
        running = false;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      measure();
      if (reduceMotion.matches) {
        curRise = targetRise;
        curF = targetF;
        write();
        return;
      }
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    measure();
    curRise = targetRise;
    curF = targetF;
    write();

    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    return () => {
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      document.documentElement.style.removeProperty("--feat-through");
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="feat" ref={sectionRef} aria-labelledby="feat-title">
      <div className="feat__stage">
        {/* 1722:51 — the same rule box and torn strike the problem section's title
            carries, because the frame builds it out of the same nodes. */}
        <div className="feat__head">
          <h2 className="feat__title" id="feat-title">
            <span className="feat__title-text">{TITLE}</span>
            <span className="feat__strike" aria-hidden />
          </h2>
        </div>

        {/* 1722:147 */}
        <div className="feat__center">
          {/* 1722:150 and 1722:151 together. The photograph is the shader's input
              rather than something drawn and then covered — see CenterGlass. It
              stays in the markup underneath as the no-WebGL2 fallback. */}
          <img className="feat__center-bg" src={CENTER_BG_SRC} alt="" />
          <CenterGlass src={CENTER_BG_SRC} />

          {/* 1722:167 and 1722:215, one element: the plate opens behind the shot and
              from then on the two move together. */}
          <div className="feat__setup">
            <img className="feat__setup-bkg" src={SETUP_BKG_SRC} alt="" aria-hidden />
            <img className="feat__setup-img" src={SETUP_SRC} alt="" />
          </div>

          {/* 1722:152 */}
          <div className="feat__content">
            <p className="feat__features">Features</p>
            <ul className="feat__boxes">
              {Array.from({ length: BOX_COUNT }, (_, i) => (
                <li className="feat__box" key={i} style={{ "--n": i } as React.CSSProperties}>
                  {BOX_TEXT.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 1722:65 */}
        <div className="feat__foot">
          <img className="feat__logo" src={WORDMARK_SRC} alt="Flash" />
          <p className="feat__foot-caption">{FOOT_CAPTION}</p>
        </div>
      </div>
    </section>
  );
}
