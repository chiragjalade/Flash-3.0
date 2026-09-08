import { useEffect, useRef } from "react";

// How much of the run is spent getting from the first letter to the last, leaving
// the rest for any one letter to make its own change. High, or it stops reading as
// letter-by-letter and becomes the whole line changing at once with a slight lean.
const SPREAD = 0.72;

// Glyph changes per second while a letter is mid-flick. Fast enough to read as
// churn, slow enough that each intermediate glyph is legible rather than a blur.
const CHURN_HZ = 18;

const NBSP = " ";

/**
 * One line of text alternating into another, letter by letter.
 *
 * The two resting states are rendered as ordinary, unsplit text, and only the churn
 * in between is built out of one span per letter.
 *
 * That split is the whole design. Per-letter spans are what the effect needs, but
 * they also destroy the typography: every letter becomes its own box, kerning pairs
 * stop applying across the boundaries, and any attempt to hold the boxes still —
 * fixing each to the wider of the two glyphs it may hold, say — pads the finished
 * line out with gaps that came from the string it is no longer showing. The settled
 * text is what anyone actually reads; it has to be set properly, and the only way to
 * set it properly is not to cut it up. So it is whole at both ends, and in pieces
 * only while it is moving, where nobody is reading it and the churn hides the seams.
 *
 * Every string is centred against the others rather than left-aligned during the
 * churn: padding the shorter ones entirely at their ends leaves the visible text
 * sitting off to one side by half the difference in length.
 */
export default function MatrixText({
  steps,
  progressRef,
  className,
}: {
  /** The copy this line passes through, in order. Two or more. */
  steps: string[];
  /**
   * Distance along `steps`, read every frame: 0 is the first, 1 the second, 2 the
   * third. A whole number is a resting state, anything between is a churn. Written
   * this way rather than as one 0..1 so a step can be added without rescaling what
   * drives it.
   */
  progressRef: { current: number };
  className?: string;
}) {
  const plainRef = useRef<HTMLSpanElement>(null);
  const splitRef = useRef<HTMLSpanElement>(null);
  const srRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const plain = plainRef.current;
    const split = splitRef.current;
    const sr = srRef.current;
    if (!plain || !split || !sr) return;

    // One span array wide enough for the longest of them, with every string centred
    // in it, so the line never jumps sideways between steps.
    const len = Math.max(...steps.map((t) => t.length));
    const offset = steps.map((t) => Math.floor((len - t.length) / 2));
    const charAt = (step: number, i: number) =>
      steps[step]![i - offset[step]!] ?? " ";

    // Only glyphs the line already contains, so the churn is never wider or narrower
    // in character than the text on either side of it.
    const pool = [...new Set(steps.join("").replace(/\s/g, "").split(""))];

    const spans: HTMLSpanElement[] = [];
    split.textContent = "";
    for (let i = 0; i < len; i++) {
      const span = document.createElement("span");
      spans.push(span);
      split.appendChild(span);
    }

    let raf = 0;
    let lastChurn = 0;
    let churnSeed = 0;
    let lastPlain = "";
    let mode = "";

    const show = (which: "plain" | "split", text?: string) => {
      if (mode !== which) {
        mode = which;
        plain.style.display = which === "plain" ? "" : "none";
        split.style.display = which === "split" ? "" : "none";
      }
      if (which === "plain" && text !== undefined && text !== lastPlain) {
        lastPlain = text;
        plain.textContent = text;
        sr.textContent = text;
      }
    };

    const tick = (now: number) => {
      const raw = Math.max(0, Math.min(steps.length - 1, progressRef.current));
      // Which pair of strings is in play, and how far between them. Clamped one short
      // of the end so arriving exactly at the last step reads as that step settled
      // rather than as the start of a transition that does not exist.
      const seg = Math.min(steps.length - 2, Math.floor(raw));
      const p = raw - seg;

      if (p <= 0.0005) {
        show("plain", steps[seg]!);
        raf = requestAnimationFrame(tick);
        return;
      }
      if (p >= 0.9995) {
        show("plain", steps[seg + 1]!);
        raf = requestAnimationFrame(tick);
        return;
      }
      show("split");
      const reading = p >= 0.5 ? steps[seg + 1]! : steps[seg]!;
      if (sr.textContent !== reading) sr.textContent = reading;

      if (now - lastChurn > 1000 / CHURN_HZ) {
        lastChurn = now;
        churnSeed++;
      }
      for (let i = 0; i < len; i++) {
        const a = charAt(seg, i);
        const b = charAt(seg + 1, i);
        const span = spans[i]!;
        let ch: string;
        if (a === b) {
          // Spaces and punctuation the two lines share hold the shape while the
          // letters between them churn.
          ch = b;
        } else {
          const start = (i / Math.max(1, len - 1)) * SPREAD;
          const local = (p - start) / (1 - SPREAD);
          if (local <= 0) ch = a;
          else if (local >= 1) ch = b;
          else {
            // Deterministic per letter per churn step, so neighbours do not flick in
            // lockstep and a repaint mid-step cannot change the glyph.
            const k = (i * 2654435761 + churnSeed * 40503) >>> 0;
            ch = pool.length ? pool[k % pool.length]! : b;
          }
        }
        const out = ch === " " ? NBSP : ch;
        if (span.textContent !== out) span.textContent = out;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
    // Joined rather than passed as an array: a literal in the caller is a new array
    // every render, which would tear this down and rebuild it sixty times a second.
  }, [steps.join("\u0000"), progressRef]);

  return (
    <span className={className}>
      <span aria-hidden ref={plainRef} />
      <span aria-hidden ref={splitRef} style={{ display: "none" }} />
      <span className="sr-only" ref={srRef} />
    </span>
  );
}
