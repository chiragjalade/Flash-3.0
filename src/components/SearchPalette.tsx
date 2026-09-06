import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./SearchPalette.css";

/* Command palette — Figma node 1067:2599 ("search") on top of 1067:2657
   ("Search Background").

   The design is a mock: its Recent rows and Quick Action rows are grey
   placeholder bars, and its chips are placeholder pills. Placeholders mean "real
   content goes here", so this drives the app's actual navigable surface instead —
   the sidebar's destinations plus the theme switcher — with the design's three
   labelled sections, chips, dividers and footer hint bar kept as-is.

   Geometry is Figma x1.25, matching how the rest of the content area was scaled
   (ResearchDesk's 240px card became 300px, its 9px title 10.5px). At 1:1 the
   design's 8px section labels are unreadable in a real browser.

   Opens on Alt+C+Space — a three-key chord, so it needs the set of currently held
   keys rather than a single-event match. */

const THEMES = [
  { id: "bw", label: "Black & White" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "glass", label: "Glass" },
  { id: "liquid-glass", label: "Liquid Glass Pro" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

const PAGES = [
  "Home",
  "Chats",
  "Projects",
  "Watchlist",
  "Workflows",
  "Workbench",
  "My Backtests",
] as const;

interface Cmd {
  id: string;
  label: string;
  meta?: string;
  group: "page" | "action";
  run: () => void;
}

interface Props {
  activePage: string;
  onNavigate: (page: string) => void;
  theme: string;
  onThemeChange: (t: ThemeId) => void;
  onToggleSidebar: () => void;
}

export default function SearchPalette({
  activePage,
  onNavigate,
  theme,
  onThemeChange,
  onToggleSidebar,
}: Props) {
  const [open, setOpen] = useState(false);
  /* Two flags, not one. `mounted` is "in the DOM", `shown` is "has .spal--in".
     `shown` lags `open` by a frame on the way in, so the enter transition has a
     start state to animate FROM; and `mounted` outlives `open` on the way out, so
     the exit transition gets to play at all. Gating the render on `open` alone
     unmounts the element in the same tick the class is removed, and the exit
     animation never runs. */
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "page" | "action">("all");
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  /* The dropdown's height is measured and applied explicitly rather than left to
     `auto`. Two reasons: `auto` cannot be transitioned, and while the panel was
     centre-aligned every content change re-centred it, so the search bar drifted
     up and down as you typed. The panel is now top-anchored and only this value
     moves, which pins the bar and grows the dropdown from its bottom edge alone.
     `ready` withholds the transition until after the first measurement, or the
     dropdown animates open from 0 on top of the entrance. */
  const [bodyH, setBodyH] = useState<number | null>(null);
  /* Vertical centring, resolved ONCE per open rather than continuously. Centring
     derives the top from the height, so recomputing it on every content change is
     exactly what made the search bar drift while typing. Measured against the
     panel's height at open — when the full list is showing — so it opens centred,
     and then held, so the bar stays put and the dropdown shrinks from its bottom
     edge alone. Re-derived on window resize only. */
  const [topOffset, setTopOffset] = useState(0);
  const [ready, setReady] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  const commands = useMemo<Cmd[]>(() => {
    const pages: Cmd[] = PAGES.map((p) => ({
      id: `page:${p}`,
      label: p,
      meta: p === activePage ? "Current" : "Page",
      group: "page",
      run: () => onNavigate(p),
    }));
    const actions: Cmd[] = [
      {
        id: "action:sidebar",
        label: "Toggle sidebar",
        meta: "Layout",
        group: "action",
        run: onToggleSidebar,
      },
      ...THEMES.map((t) => ({
        id: `action:theme:${t.id}`,
        label: `Theme — ${t.label}`,
        meta: t.id === theme ? "Active" : "Appearance",
        group: "action" as const,
        run: () => onThemeChange(t.id),
      })),
    ];
    return [...pages, ...actions];
  }, [activePage, onNavigate, onThemeChange, onToggleSidebar, theme]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      commands.filter(
        (c) =>
          (scope === "all" || c.group === scope) &&
          (!q || c.label.toLowerCase().includes(q)),
      ),
    [commands, q, scope],
  );

  // Empty query → the design's "Recent" list. Typing → the matches take its place.
  const primary = useMemo(() => {
    if (q) return matches.filter((c) => c.group === "page");
    const byId = new Map(commands.map((c) => [c.id, c]));
    return recent
      .map((id) => byId.get(id))
      .filter((c): c is Cmd => !!c)
      // the scope chips filter Recent as well, or picking "Actions" leaves stale
      // page entries sitting above the actions list
      .filter((c) => scope === "all" || c.group === scope)
      .slice(0, 3);
  }, [q, matches, recent, commands, scope]);

  const quick = useMemo(
    () => matches.filter((c) => c.group === "action"),
    [matches],
  );

  // One flat index across both lists, so the arrow keys walk the whole panel.
  const flat = useMemo(() => [...primary, ...quick], [primary, quick]);

  const runAt = useCallback(
    (i: number) => {
      const cmd = flat[i];
      if (!cmd) return;
      cmd.run();
      setRecent((r) => [cmd.id, ...r.filter((x) => x !== cmd.id)].slice(0, 6));
      close();
    },
    [flat, close],
  );

  /* ---- Alt+C+Space -------------------------------------------------------
     A chord cannot be matched from one event: `Space` arrives with altKey set
     but carries nothing about C. So track what is physically down. `e.code` and
     not `e.key`, because Alt+C emits "ç" on macOS while the code stays "KeyC".
     `fired` latches until a chord key is released, or auto-repeat re-triggers
     the toggle dozens of times per second. */
  useEffect(() => {
    const held = new Set<string>();
    let fired = false;
    const onDown = (e: KeyboardEvent) => {
      held.add(e.code);
      if (e.altKey && held.has("KeyC") && held.has("Space")) {
        if (!fired) {
          fired = true;
          e.preventDefault();
          setOpen((o) => !o);
        }
        return;
      }
      if (e.code === "Escape") setOpen(false);
    };
    const onUp = (e: KeyboardEvent) => {
      held.delete(e.code);
      if (e.code === "KeyC" || e.code === "Space" || e.code === "AltLeft" || e.code === "AltRight")
        fired = false;
    };
    // A chord that moves focus (or triggers an OS shortcut) can swallow the keyup,
    // leaving a key stuck "down" forever.
    const clear = () => {
      held.clear();
      fired = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // Open → put it in the DOM. Close → strip .spal--in, then unmount once the exit
  // transition has finished.
  useEffect(() => {
    if (open) {
      setQuery("");
      setScope("all");
      setCursor(0);
      setMounted(true);
      return;
    }
    setShown(false);
    /* Must outlast the slowest exit leg or the panel is unmounted mid-animation.
       Longest is the bar: 0.22s transform + 0.05s delay = 0.27s. */
    const t = setTimeout(() => setMounted(false), 340);
    return () => clearTimeout(t);
  }, [open]);

  /* Flipping .spal--in has to happen in a LATER frame than the mount, in its own
     effect keyed on `mounted`. Scheduling the rAF alongside setMounted(true) — as
     this did — schedules it before React has even committed the mount, so the
     browser's first paint of the element already has the class on it. With no
     earlier painted state to interpolate from, a CSS transition has nothing to do
     and the panel simply appears. Two frames: the first paints the closed state,
     the second starts the transition. */
  useEffect(() => {
    if (!mounted || !open) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [mounted, open]);

  useLayoutEffect(() => {
    if (!mounted) {
      setReady(false);
      return;
    }
    const measure = (recentre: boolean) => {
      const inner = innerRef.current;
      const wrap = wrapRef.current;
      if (!inner || !wrap) return;
      // Cap against the space actually left in the overlay rather than a CSS
      // percentage — the panel's own height is content-driven, so a percentage
      // max-height inside it resolves against a moving target.
      const style = getComputedStyle(wrap);
      const avail =
        wrap.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom) -
        62; // bar (46) + panel gap (16)
      const foot = footRef.current?.offsetHeight ?? 0;
      /* Measure the UNCONSTRAINED wrapper, not .spal__scroll: a scroll container's
         scrollHeight never reports less than its own clientHeight, so measuring it
         would let the dropdown grow but never shrink. The wrapper has no height of
         its own, so it tracks the content both ways — but it also sits inside the
         scroller's padding, which therefore has to be added back by hand. */
      const scroller = listRef.current;
      const pad = scroller
        ? (() => {
            const cs = getComputedStyle(scroller);
            return parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
          })()
        : 0;
      const want = inner.scrollHeight + pad + foot + 2; // +2 = the body's 1px borders
      const h = Math.max(80, Math.min(want, avail));
      setBodyH(h);
      if (recentre) setTopOffset(Math.max(0, Math.round((avail - h) / 2)));
    };
    // First pass recentres — bodyH is still null here, so the body is at its
    // natural height and this measures the panel as the user will first see it.
    measure(true);
    // Content changes move the height only. ResizeObserver also fires once on
    // observe, which is why this one must not recentre.
    const ro = new ResizeObserver(() => measure(false));
    if (innerRef.current) ro.observe(innerRef.current);
    const onResize = () => measure(true);
    window.addEventListener("resize", onResize);
    // Transition only from the second frame on, so the first height lands silently.
    const raf = requestAnimationFrame(() => setReady(true));
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [mounted]);

  useEffect(() => {
    if (shown) inputRef.current?.focus();
  }, [shown]);

  useEffect(() => setCursor(0), [q, scope]);

  // Keep the active row in view as the cursor walks past the scroll edge.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!mounted) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => (c + d + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const row = (cmd: Cmd, i: number) => (
    <button
      key={cmd.id}
      type="button"
      className="spal__row"
      data-active={i === cursor}
      onMouseEnter={() => setCursor(i)}
      onClick={() => runAt(i)}
    >
      <span className="spal__row-label">{cmd.label}</span>
      {cmd.meta && <span className="spal__row-meta">{cmd.meta}</span>}
    </button>
  );

  const chips: { id: "all" | "page" | "action"; label: string; n: number }[] = [
    { id: "all", label: "Everything", n: commands.length },
    {
      id: "page",
      label: "Pages",
      n: commands.filter((c) => c.group === "page").length,
    },
    {
      id: "action",
      label: "Actions",
      n: commands.filter((c) => c.group === "action").length,
    },
  ];

  return (
    <div
      className={`spal${shown ? " spal--in" : ""}`}
      ref={wrapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      {/* Figma 1067:2657 — blurred gradient over the content area only; the
          sidebar stays crisp, as in the design. */}
      <div className="spal__scrim" onClick={close} aria-hidden />

      <div
        className="spal__panel"
        data-ready={ready}
        style={{ marginTop: `${topOffset}px` }}
      >
        {/* Figma 1067:2645 — the input is its own rounded box above the results */}
        <div className="spal__bar">
          <span className="spal__bar-icon" aria-hidden />
          <input
            ref={inputRef}
            className="spal__input"
            placeholder="Search..."
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="spal__keys" aria-hidden>
            <kbd className="spal__key">⌥</kbd>
            <kbd className="spal__key">C</kbd>
          </span>
        </div>

        {/* Figma 1067:2601 */}
        <div
          className="spal__body"
          data-ready={ready}
          style={bodyH != null ? { height: `${bodyH}px` } : undefined}
        >
          <div className="spal__scroll" ref={listRef}>
            <div className="spal__inner" ref={innerRef}>
            <section className="spal__sec">
              <h2 className="spal__sec-label">Searching For</h2>
              <div className="spal__chips">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="spal__chip"
                    data-on={scope === c.id}
                    onClick={() => setScope(c.id)}
                  >
                    {c.label}
                    <span className="spal__chip-n">{c.n}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="spal__rule" />

            <section className="spal__sec">
              <h2 className="spal__sec-label">{q ? "Results" : "Recent"}</h2>
              {primary.length ? (
                <div className="spal__rows">{primary.map((c, i) => row(c, i))}</div>
              ) : (
                <p className="spal__empty">
                  {q ? "No pages match." : "Nothing yet — run something to see it here."}
                </p>
              )}
            </section>

            <div className="spal__rule" />

            <section className="spal__sec">
              <h2 className="spal__sec-label">Quick Actions</h2>
              {quick.length ? (
                <div className="spal__rows">
                  {quick.map((c, i) => row(c, primary.length + i))}
                </div>
              ) : (
                <p className="spal__empty">No actions match.</p>
              )}
            </section>
            </div>
          </div>

          {/* Figma 1067:2652 + 1698:16/17/30 — hint bar pinned to the panel base */}
          <div className="spal__foot" ref={footRef}>
            <span className="spal__hint">
              <kbd className="spal__key spal__key--sm">↑</kbd>
              <kbd className="spal__key spal__key--sm">↓</kbd>
              Move
            </span>
            <span className="spal__hint">
              <kbd className="spal__key spal__key--sm spal__key--enter" />
              Select
            </span>
            <span className="spal__hint">
              <kbd className="spal__key spal__key--sm spal__key--esc">ESC</kbd>
              Quit
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
