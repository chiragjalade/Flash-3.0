import { useRef, useState, type CSSProperties } from "react";
import "./Treemap.css";

interface Segment {
  label: string;
  change: number; // percent
  weight: number; // relative size
}

interface Company {
  name: string;
  domain: string; // used to pull the logo from the web
  change: number;
  weight: number;
  color: string; // base tile colour (same palette as the reference)
  segments: Segment[];
}

// Selected companies, laid out in 3 rows. `weight` drives dynamic tile sizing.
const rows: Company[][] = [
  [
    {
      name: "NVIDIA",
      domain: "nvidia.com",
      change: 1.85,
      weight: 30,
      color: "#d7e9cf",
      segments: [
        { label: "Data Center", change: 2.45, weight: 40 },
        { label: "Gaming", change: 1.3, weight: 20 },
        { label: "Auto", change: 0.95, weight: 15 },
        { label: "Pro Visualization", change: 1.1, weight: 13 },
        { label: "OEM & Other", change: 0.6, weight: 12 },
      ],
    },
    {
      name: "APPLE",
      domain: "apple.com",
      change: 0.35,
      weight: 34,
      color: "#e9e9e9",
      segments: [
        { label: "iPhone", change: 0.45, weight: 32 },
        { label: "Services", change: 0.68, weight: 22 },
        { label: "Mac", change: -0.12, weight: 16 },
        { label: "iPad", change: 0.1, weight: 14 },
        { label: "Wearables & Home", change: 0.25, weight: 16 },
      ],
    },
    {
      name: "MICROSOFT",
      domain: "microsoft.com",
      change: 0.5,
      weight: 30,
      color: "#d5e6f4",
      segments: [
        { label: "Cloud (Azure)", change: 0.8, weight: 30 },
        { label: "Office", change: 0.3, weight: 18 },
        { label: "Windows", change: 0.15, weight: 16 },
        { label: "LinkedIn", change: 0.25, weight: 14 },
        { label: "Gaming", change: 0.4, weight: 14 },
      ],
    },
  ],
  [
    {
      name: "TESLA",
      domain: "tesla.com",
      change: -0.75,
      weight: 24,
      color: "#f4d9d9",
      segments: [
        { label: "Automotive", change: -0.6, weight: 50 },
        { label: "Energy & Storage", change: -0.9, weight: 28 },
        { label: "Services & Other", change: -0.4, weight: 22 },
      ],
    },
    {
      name: "SPACEX",
      domain: "spacex.com",
      change: 0.9,
      weight: 26,
      color: "#e0e6ee",
      segments: [
        { label: "Launch Services", change: 1.2, weight: 40 },
        { label: "Starlink", change: 0.85, weight: 35 },
        { label: "Other Programs", change: 0.4, weight: 25 },
      ],
    },
    {
      name: "AMD",
      domain: "amd.com",
      change: -0.35,
      weight: 22,
      color: "#e5e0f0",
      segments: [
        { label: "Data Center", change: -0.2, weight: 35 },
        { label: "Client Processors", change: -0.4, weight: 30 },
        { label: "Gaming", change: -0.5, weight: 20 },
        { label: "Embedded", change: -0.1, weight: 15 },
      ],
    },
  ],
  [
    {
      name: "GOOGLE",
      domain: "google.com",
      change: 0.65,
      weight: 30,
      color: "#d8e7f5",
      segments: [
        { label: "Search & Other", change: 0.7, weight: 40 },
        { label: "YouTube Ads", change: 0.5, weight: 22 },
        { label: "Google Cloud", change: 0.8, weight: 22 },
        { label: "Network", change: 0.4, weight: 16 },
      ],
    },
    {
      name: "META",
      domain: "meta.com",
      change: -0.1,
      weight: 22,
      color: "#dbe8f4",
      segments: [
        { label: "Family of Apps", change: -0.05, weight: 55 },
        { label: "Reality Labs", change: -0.3, weight: 25 },
        { label: "Ad Infrastructure", change: 0.1, weight: 20 },
      ],
    },
    {
      name: "PALANTIR",
      domain: "palantir.com",
      change: 1.2,
      weight: 22,
      color: "#e8e8e8",
      segments: [
        { label: "Government", change: 1.4, weight: 45 },
        { label: "Commercial", change: 1.1, weight: 35 },
        { label: "Platform", change: 0.3, weight: 20 },
      ],
    },
  ],
];

// Companies the user "follows" (the treemap tiles) — used to scope the News feed.
export const trackedCompanies = rows.flat().map((c) => ({
  name: c.name,
  domain: c.domain,
}));

const fmt = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const sign = (n: number) => (n >= 0 ? "up" : "down");

// Market heat-map tint: green for gainers, red for losers, intensity growing with
// the size of the move (near-flat → pale, big move → vivid).
const heatColor = (change: number) => {
  const t = Math.min(1, Math.abs(change) / 1.8); // 0 (flat) … 1 (big move)
  const hue = change >= 0 ? 142 : 4;
  const sat = 42 + t * 46; // 42% … 88%
  const light = 68 - t * 22; // 68% … 46%
  return `hsl(${hue} ${sat}% ${light}%)`;
};

// Black monochrome brand mark from the web: Simple Icons serves a transparent
// black SVG per brand (slug = lowercased name). Falls back to a favicon (forced
// black by the CSS filter on .tm-logo) for brands Simple Icons doesn't carry.
function CompanyLogo({ name, domain }: { name: string; domain: string }) {
  const slug = name.toLowerCase();

  // Simple Icons dropped Microsoft's master brand, so draw its 4-square mark
  // inline (always black, no network dependency to disappear on).
  if (slug === "microsoft") {
    return (
      <svg
        className="tm-logo"
        width={15}
        height={15}
        viewBox="0 0 24 24"
        aria-hidden
        style={{ flexShrink: 0 }}
      >
        <rect x="1" y="1" width="10" height="10" />
        <rect x="13" y="1" width="10" height="10" />
        <rect x="1" y="13" width="10" height="10" />
        <rect x="13" y="13" width="10" height="10" />
      </svg>
    );
  }

  return (
    <img
      className="tm-logo"
      src={`https://cdn.simpleicons.org/${slug}/000000`}
      alt=""
      width={15}
      height={15}
      style={{ width: 15, height: 15, objectFit: "contain", flexShrink: 0 }}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.fallback) {
          img.style.visibility = "hidden";
          return;
        }
        img.dataset.fallback = "1";
        img.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
      }}
    />
  );
}

const allCompanies = rows.flat();

export default function Treemap() {
  const tmRef = useRef<HTMLDivElement>(null);
  // Which company is zoomed to fill the whole treemap (null = grid view). The
  // origin is the clicked tile's centre so the panel appears to grow out of it.
  const [focus, setFocus] = useState<{ name: string; origin: string } | null>(
    null,
  );
  const [showPanel, setShowPanel] = useState(false);
  const [closing, setClosing] = useState(false);

  const openFocus = (el: HTMLElement, name: string) => {
    const box = tmRef.current?.getBoundingClientRect();
    const tile = el.getBoundingClientRect();
    let origin = "50% 50%";
    if (box && box.width && box.height) {
      const ox = ((tile.left + tile.width / 2 - box.left) / box.width) * 100;
      const oy = ((tile.top + tile.height / 2 - box.top) / box.height) * 100;
      origin = `${ox.toFixed(1)}% ${oy.toFixed(1)}%`;
    }
    setClosing(false);
    // 1) hide the grid (focus set → grid fades/scales out), then
    // 2) grow the focused company's panel in once the grid is gone.
    setFocus({ name, origin });
    window.setTimeout(() => setShowPanel(true), 200);
  };

  const close = () => {
    // Panel shrinks back out; grid fades in behind it, then panel unmounts.
    setClosing(true);
    window.setTimeout(() => {
      setShowPanel(false);
      setFocus(null);
      setClosing(false);
    }, 240);
  };

  // Grid is hidden while a company is focused (but reappears during close).
  const gridGone = !!focus && !closing;

  const focusCo = focus
    ? allCompanies.find((c) => c.name === focus.name)
    : null;

  return (
    <div className="tm" ref={tmRef} role="img" aria-label="Market heatmap treemap">
      <div className={`tm-grid${gridGone ? " tm-grid--gone" : ""}`}>
        {rows.map((row, r) => (
          <div className="tm__row" key={r}>
            {row.map((co) => (
              <div className="tm-co" key={co.name} style={{ flex: co.weight }}>
                <div
                  className="tm-tile tm-tile--main"
                  role="button"
                  tabIndex={0}
                  aria-label={`${co.name} ${fmt(co.change)} — view segments`}
                  onClick={(e) => openFocus(e.currentTarget, co.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openFocus(e.currentTarget, co.name);
                    }
                  }}
                  style={{ "--tm-color": heatColor(co.change) } as CSSProperties}
                >
                  <span className="tm-co-head">
                    <CompanyLogo name={co.name} domain={co.domain} />
                    <span className="tm-name">{co.name}</span>
                  </span>
                  <span className="tm-chg" data-sign={sign(co.change)}>
                    {fmt(co.change)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {showPanel && focusCo && (
        <div
          className={`tm-focus${closing ? " tm-focus--closing" : ""}`}
          style={{ transformOrigin: focus?.origin }}
        >
          <div
            className="tm-tile tm-focus__head"
            role="button"
            tabIndex={0}
            aria-label="Back to all companies"
            onClick={close}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
            style={{ "--tm-color": heatColor(focusCo.change) } as CSSProperties}
          >
            <span className="tm-focus__back">‹ Back</span>
            <span className="tm-co-head">
              <CompanyLogo name={focusCo.name} domain={focusCo.domain} />
              <span className="tm-name">{focusCo.name}</span>
            </span>
            <span className="tm-chg" data-sign={sign(focusCo.change)}>
              {fmt(focusCo.change)}
            </span>
          </div>
          <div className="tm-focus__segs">
            {focusCo.segments.map((s) => (
              <div
                className="tm-tile tm-seg tm-focus__seg"
                key={s.label}
                style={
                  {
                    flex: s.weight,
                    "--tm-color": heatColor(s.change),
                  } as CSSProperties
                }
              >
                <span className="tm-seg-name">{s.label}</span>
                <span className="tm-seg-chg" data-sign={sign(s.change)}>
                  {fmt(s.change)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
