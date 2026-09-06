import { useEffect, useRef, useState } from "react";
import "./ClockWidget.css";

// Square analog-clock widget (top-right, collapsible). Clock-hand rotation logic
// adapted from github.com/frankiefab100/Analog-Clock; the dial/ticks are drawn
// in CSS so it themes cleanly (incl. glass) instead of relying on an image.

const TIMEZONES: { label: string; zone?: string }[] = [
  { label: "Local" },
  { label: "Los Angeles", zone: "America/Los_Angeles" },
  { label: "New York", zone: "America/New_York" },
  { label: "London", zone: "Europe/London" },
  { label: "Paris", zone: "Europe/Paris" },
  { label: "Dubai", zone: "Asia/Dubai" },
  { label: "Mumbai", zone: "Asia/Kolkata" },
  { label: "Singapore", zone: "Asia/Singapore" },
  { label: "Tokyo", zone: "Asia/Tokyo" },
  { label: "Sydney", zone: "Australia/Sydney" },
];

// Cache Intl formatters (one per zone) so we don't rebuild them every frame.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function getFmt(zone: string) {
  let f = fmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(zone, f);
  }
  return f;
}

// Hand angles (degrees, 0 = 12 o'clock) for the given time in the given zone.
function zoneAngles(now: Date, zone?: string) {
  let h: number, m: number, s: number;
  if (zone) {
    const parts = getFmt(zone).formatToParts(now);
    const get = (t: string) =>
      Number(parts.find((p) => p.type === t)?.value ?? 0);
    h = get("hour") % 12;
    m = get("minute");
    s = get("second");
  } else {
    h = now.getHours() % 12;
    m = now.getMinutes();
    s = now.getSeconds();
  }
  const sf = s + now.getMilliseconds() / 1000;
  const mf = m + sf / 60;
  const hf = h + mf / 60;
  return { h: hf * 30, m: mf * 6, s: sf * 6 };
}

// Choose the representation of `raw` nearest to `prev` so the hand takes the
// shortest path (no full-circle spins) when time/zone jumps.
function unwrap(prev: number, raw: number) {
  let a = raw;
  while (a - prev > 180) a -= 360;
  while (a - prev < -180) a += 360;
  return a;
}

// Liquid-glass clock states:
//   in  – merged into the small button (shrunk to button size, at the corner)
//   out – demerged, full-size clock to the LEFT of the button
// The clock always stays within the WebGL merge reach of the button, so the
// liquid neck stretches/collapses between them on every move.
type LgMode = "in" | "out";

export default function ClockWidget({ theme }: { theme: string }) {
  const lg = theme === "liquid-glass";
  // The hover tilt is a glass-theme effect; the flat themes leave the card square.
  const glassy = theme.includes("glass");
  // Liquid-glass merge state (see LgMode). Starts merged IN, then auto-demerges;
  // clicking the button (or clock) toggles. Other themes ignore it / use collapsed.
  const [mode, setMode] = useState<LgMode>(lg ? "in" : "out");
  const [collapsed, setCollapsed] = useState(false);
  const [jiggle, setJiggle] = useState(false); // transient: button settle wiggle
  const [merging, setMerging] = useState(false); // clock↔button mergeable in WebGL
  const transitioningRef = useRef(false); // true while the merge/demerge morph runs
  const modeTimers = useRef<number[]>([]);
  const [tzIndex, setTzIndex] = useState(0);
  const [showTz, setShowTz] = useState(false);
  const [animating, setAnimating] = useState(false);

  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);
  const secRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const tiltWrapRef = useRef<HTMLDivElement>(null); // holds the hover tilt in lg
  const boxRef = useRef<HTMLDivElement>(null);

  const zoneRef = useRef<string | undefined>(undefined);
  const lastAngles = useRef({ h: 0, m: 0, s: 0 });

  const tiltRaf = useRef(0);
  const tiltNext = useRef("");
  const boxTiltRaf = useRef(0);
  const boxTiltNext = useRef("");
  const hideTimer = useRef<number | undefined>(undefined);
  const animTimer = useRef<number | undefined>(undefined);

  // Drag-to-move (+ click detection so a click toggles the merge, a drag moves)
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const downPos = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ dx: 0, dy: 0 });

  // Entering the Liquid Glass theme (by switching OR loading straight into it on
  // refresh): snap to the small button, hold ~0.5s, then let the clock emerge from
  // it. The WebGL glass layer (card + button both mergeable) makes the grow gooey —
  // a liquid "reverse merge" out of the button. `emergeSnap` kills the transition
  // for the initial snap so it starts cleanly at the button. prevTheme starts null
  // so a fresh mount already in liquid-glass counts as "entering".
  const prevTheme = useRef<string | null>(null);
  const [emergeSnap, setEmergeSnap] = useState(false);
  useEffect(() => {
    const was = prevTheme.current;
    prevTheme.current = theme;
    if (theme === "liquid-glass" && was !== "liquid-glass") {
      setEmergeSnap(true); // no transition → start merged INTO the button
      setMode("in");
      const t0 = window.setTimeout(() => setEmergeSnap(false), 60); // re-arm transitions
      const t1 = window.setTimeout(() => changeMode("out"), 2600); // 2.6s: demerge out to the left
      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
        modeTimers.current.forEach(clearTimeout);
      };
    }
  }, [theme]);

  // Sync the active zone + play the smooth "rotate to new zone" transition.
  useEffect(() => {
    zoneRef.current = TIMEZONES[tzIndex]?.zone;
    setAnimating(true);
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = window.setTimeout(() => setAnimating(false), 650);
  }, [tzIndex]);

  // Drive the hands (sweeping second hand). Reads zoneRef live; paused collapsed.
  useEffect(() => {
    if (collapsed) return;
    let raf = 0;
    const tick = () => {
      const raw = zoneAngles(new Date(), zoneRef.current);
      const hu = unwrap(lastAngles.current.h, raw.h);
      const mu = unwrap(lastAngles.current.m, raw.m);
      const su = unwrap(lastAngles.current.s, raw.s);
      lastAngles.current = { h: hu, m: mu, s: su };
      if (hourRef.current) hourRef.current.style.transform = `rotate(${hu}deg)`;
      if (minRef.current) minRef.current.style.transform = `rotate(${mu}deg)`;
      if (secRef.current) secRef.current.style.transform = `rotate(${su}deg)`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [collapsed]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (animTimer.current) clearTimeout(animTimer.current);
    },
    [],
  );

  // --- Timezone box hover show / delayed hide ---
  const showTzBox = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
    setShowTz(true);
  };
  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowTz(false), 4000);
  };
  const changeTz = (dir: number) =>
    setTzIndex((i) => (i + dir + TIMEZONES.length) % TIMEZONES.length);

  // --- Hover tilt + subtle translate (shared by the clock card and the tz box) ---
  const tiltMove = (
    el: HTMLDivElement | null,
    e: React.MouseEvent<HTMLDivElement>,
    rafRef: React.MutableRefObject<number>,
    nextRef: React.MutableRefObject<string>,
    tilt: number,
    shift: number,
  ) => {
    if (!el || !glassy) return;
    const r = el.getBoundingClientRect();
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    const nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
    const ny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2));
    nextRef.current =
      `perspective(700px) rotateX(${(-ny * tilt).toFixed(2)}deg) rotateY(${(nx * tilt).toFixed(2)}deg)` +
      ` translate3d(${(nx * shift).toFixed(2)}px, ${(ny * shift).toFixed(2)}px, 0)`;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        // fast inline transition so the tilt stays snappy even though the card's
        // CSS transform transition is slow (for the merge/de-merge morph)
        el.style.transition = "transform 0.14s ease-out";
        el.style.transform = nextRef.current;
      });
    }
  };
  const tiltReset = (
    el: HTMLDivElement | null,
    rafRef: React.MutableRefObject<number>,
  ) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (el) {
      el.style.transition = "transform 0.3s ease-out"; // quick, smooth untilt
      el.style.transform = "";
    }
  };

  const onCardMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingRef.current) return; // no tilt while dragging
    // Tilt is applied to the inner wrapper in liquid-glass (see onTiltMove below),
    // so the card's own transform stays free for the merge morph.
    if (lg) return tiltMove(tiltWrapRef.current, e, tiltRaf, tiltNext, 6, 4);
    tiltMove(cardRef.current, e, tiltRaf, tiltNext, 6, 4);
  };
  const onCardLeave = () => {
    tiltReset(lg ? tiltWrapRef.current : cardRef.current, tiltRaf);
    scheduleHide();
  };
  const onBoxMove = (e: React.MouseEvent<HTMLDivElement>) =>
    tiltMove(boxRef.current, e, boxTiltRaf, boxTiltNext, 5, 3);
  const onBoxLeave = () => {
    tiltReset(boxRef.current, boxTiltRaf);
    scheduleHide();
  };

  const collapse = () => {
    if (cardRef.current) cardRef.current.style.transform = "";
    setPos(null); // return home so it merges back into the (fixed) button
    setCollapsed(true);
  };

  // Drive a merge/demerge: clear any inline tilt so the CSS morph runs cleanly,
  // block the tilt during the move, and wiggle the button once it's a clean shape
  // again (clock cleared out ~0.65s / finished merging in ~1.5s).
  const changeMode = (next: LgMode) => {
    transitioningRef.current = true;
    setMerging(true); // clock+button smooth-union (neck) while moving
    setJiggle(false);
    modeTimers.current.forEach(clearTimeout);
    // The instant the clock is (nearly) back to rest — seated into the button, or
    // cleared out — drop the merge (button snaps to its clean shape) AND wiggle it,
    // so there's no lingering bulge and no delay before the bounce.
    const settleAt = next === "in" ? 1420 : 780;
    modeTimers.current = [
      window.setTimeout(() => (transitioningRef.current = false), 1550),
      window.setTimeout(() => {
        setMerging(false);
        setJiggle(true);
      }, settleAt),
      window.setTimeout(() => setJiggle(false), settleAt + 650),
    ];
    setMode(next);
  };

  // Instantly clear any inline transform left on the card by a drag (the dynamic
  // shrink), so the CSS mode morph isn't overridden. transition:none + reflow so
  // the reset doesn't animate.
  const resetCardTransform = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "";
    void el.offsetHeight;
    el.style.transition = "";
  };

  // Liquid-glass: toggle the clock merged-IN (shrunk into the button) ⇄ demerged-
  // OUT (full size, left of the button). Reset any drag so the merge lines up with
  // the fixed button. Either way the liquid neck plays.
  const toggleLg = () => {
    setPos(null);
    resetCardTransform();
    changeMode(mode === "out" ? "in" : "out");
  };

  // Small button click: merge the clock back in / demerge it out (liquid-glass);
  // else the old collapse behaviour.
  const onMiniClick = () => {
    if (lg) return toggleLg();
    setCollapsed((v) => !v);
  };

  // --- Drag the clock to reposition it (the fixed button stays put). A press
  //     without movement counts as a click → toggle the merge in liquid-glass. ---
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    // let buttons / the timezone box handle their own clicks
    if ((e.target as HTMLElement).closest("button, .clock-widget__tz")) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    draggingRef.current = true;
    movedRef.current = false;
    downPos.current = { x: e.clientX, y: e.clientY };
    tiltReset(lg ? tiltWrapRef.current : cardRef.current, tiltRaf); // clear tilt
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    if (
      !movedRef.current &&
      Math.hypot(e.clientX - downPos.current.x, e.clientY - downPos.current.y) < 4
    )
      return; // ignore sub-4px jitter so a click doesn't register as a drag
    movedRef.current = true;
    setPos({
      x: e.clientX - dragOffset.current.dx,
      y: e.clientY - dragOffset.current.dy,
    });
    // Dynamic shrink: the nearer the button, the smaller the clock (down to the
    // button's size), so it looks like it's about to merge in. Set inline (no
    // transition) so it tracks the drag frame-by-frame.
    if (lg && cardRef.current) {
      const b = containerRef.current
        ?.querySelector(".clock-widget__mini")
        ?.getBoundingClientRect();
      if (b) {
        const d = Math.hypot(
          e.clientX - (b.left + b.width / 2),
          e.clientY - (b.top + b.height / 2),
        );
        const s = 0.222 + (1 - 0.222) * Math.min(1, d / 200);
        cardRef.current.style.transition = "none";
        cardRef.current.style.transform = `scale(${s.toFixed(3)})`;
      }
    }
  };
  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasDragging = draggingRef.current;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!wasDragging || !lg) return;
    if (!movedRef.current) return toggleLg(); // click → toggle merge
    if (mode !== "out") return;
    const b = containerRef.current
      ?.querySelector(".clock-widget__mini")
      ?.getBoundingClientRect();
    const near =
      !!b &&
      Math.hypot(
        e.clientX - (b.left + b.width / 2),
        e.clientY - (b.top + b.height / 2),
      ) < 120;
    if (near) {
      // Dropped over/near the button → finish closing. Set mode first, then clear
      // the inline shrink next frame so the CSS "in" morph continues smoothly from
      // the already-shrunk state into the button.
      setPos(null);
      changeMode("in");
      requestAnimationFrame(() => {
        if (cardRef.current) {
          cardRef.current.style.transition = "";
          cardRef.current.style.transform = "";
        }
      });
    } else if (cardRef.current) {
      // Dropped away → grow smoothly back to full size.
      cardRef.current.style.transition = "transform 0.4s ease";
      cardRef.current.style.transform = "scale(1)";
    }
  };

  return (
    <div
      ref={containerRef}
      className={`clock-widget${
        lg
          ? ` clock-widget--lg clock-widget--${mode}`
          : collapsed
            ? " clock-widget--collapsed"
            : ""
      }${pos ? " clock-widget--dragged" : ""}${emergeSnap ? " clock-widget--emerge-snap" : ""}${jiggle ? " clock-widget--jiggle" : ""}${merging ? " clock-widget--merging" : ""}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
          : undefined
      }
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
    >
      <div
        className="clock-widget__card"
        ref={cardRef}
        onMouseEnter={showTzBox}
        onMouseMove={onCardMove}
        onMouseLeave={onCardLeave}
      >
        <button
          type="button"
          className="clock-widget__collapse"
          onClick={collapse}
          aria-label="Collapse clock"
          title="Collapse"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path
              d="M2 5h6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* tilt wrapper: the hover tilt lives here (not on the card) so it can't
            fight the card's merge/demerge transform */}
        <div className="cw-tilt" ref={tiltWrapRef}>
          <div className={`clock-widget__dial${animating ? " is-animating" : ""}`}>
            <div className="cw-ticks">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  className="cw-tick-wrap"
                  key={i}
                  style={{ transform: `rotate(${i * 30}deg)` }}
                >
                  <span className={`cw-tick${i % 3 === 0 ? " cw-tick--major" : ""}`} />
                </div>
              ))}
            </div>

            <div className="cw-hand cw-hand--hour" ref={hourRef} />
            <div className="cw-hand cw-hand--min" ref={minRef} />
            <div className="cw-hand cw-hand--sec" ref={secRef} />
            <div className="cw-cap" />
          </div>
        </div>
      </div>

      {/* Timezone selector — reveals on hover, hides 4s after the cursor leaves */}
      <div
        className={`clock-widget__tz${showTz && !collapsed ? " clock-widget__tz--show" : ""}`}
        ref={boxRef}
        onMouseEnter={showTzBox}
        onMouseMove={onBoxMove}
        onMouseLeave={onBoxLeave}
      >
        <button
          type="button"
          className="clock-widget__tz-arrow"
          onClick={() => changeTz(-1)}
          aria-label="Previous time zone"
        >
          ‹
        </button>
        <span className="clock-widget__tz-label">{TIMEZONES[tzIndex]?.label}</span>
        <button
          type="button"
          className="clock-widget__tz-arrow"
          onClick={() => changeTz(1)}
          aria-label="Next time zone"
        >
          ›
        </button>
      </div>

      <button
        type="button"
        className="clock-widget__mini"
        onClick={onMiniClick}
        aria-label="Expand clock"
        title="Clock"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      </button>
    </div>
  );
}
