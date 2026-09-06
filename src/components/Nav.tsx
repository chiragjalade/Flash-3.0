import { useEffect, useRef } from "react";
import "./Nav.css";

// Placeholder destinations — nothing routes yet, so these are buttons rather than
// links with dead hrefs.
//
// `inBar` is why Team is not a fourth label up top: the bar's width is the panel's
// 344px floor on every viewport under ~940px, and three uppercase labels plus the
// burger already need ~330px of it. A fourth would run past the edge exactly the
// way CONTACT did before the floor was raised. The drawer has no such limit.
const ITEMS = [
  { label: "Product", blurb: "Research, screening and backtests in one desk.", inBar: true },
  { label: "About", blurb: "Who we are and how the models are built.", inBar: true },
  { label: "Team", blurb: "The people behind the research." },
  { label: "Contact", blurb: "Talk to us about access and pricing.", inBar: true },
];

const BAR_ITEMS = ITEMS.filter((it) => it.inBar);

export default function Nav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navRef = useRef<HTMLElement>(null);

  // Escape closes, and focus goes back to the burger so keyboard users aren't
  // dropped at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onOpenChange(false);
      navRef.current?.querySelector<HTMLButtonElement>(".nav__burger")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {/* Separate element, not a child of .nav: the blur has to cover the whole
          viewport, and .nav is a narrow centred box. It also sits before .nav in
          the DOM so the panel paints over it without a z-index fight. */}
      <div
        className="nav-scrim"
        data-open={open || undefined}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />

      <nav className="nav" data-open={open || undefined} ref={navRef}>
        <div className="nav__panel">
          <div className="nav__bar">
            <button
              type="button"
              className="nav__burger"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="nav-drawer"
              onClick={() => onOpenChange(!open)}
            >
              <span className="nav__burger-lines" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </button>

            <div className="nav__links">
              {BAR_ITEMS.map((it) => (
                <button type="button" className="nav__link" key={it.label}>
                  {it.label}
                </button>
              ))}
            </div>
          </div>

          {/* 0fr -> 1fr rather than a max-height guess: the row resolves to the
              content's real height, so the panel expands to fit whatever goes in
              here without a magic number that breaks when the copy changes. */}
          <div className="nav__drawer" id="nav-drawer">
            <div className="nav__drawer-clip">
              <div className="nav__drawer-inner">
                {ITEMS.map((it) => (
                  <button
                    type="button"
                    className="nav__item"
                    key={it.label}
                    tabIndex={open ? 0 : -1}
                    onClick={() => onOpenChange(false)}
                  >
                    <span className="nav__item-label">{it.label}</span>
                    <span className="nav__item-blurb">{it.blurb}</span>
                  </button>
                ))}
                {/* The homepage's edge motif again, small and centred, closing the
                    drawer off. Same asset as .hero__motif — one file, recoloured by
                    the mask's backing colour. */}
                <div className="nav__motif" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
