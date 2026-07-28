import { useEffect, useMemo, useRef, useState } from "react";
import { searchCompanies, type Company } from "../lib/companySearch";
import "./WatchlistPage.css";

// Real brand logo with a graceful fallback: renders the company's verified logo
// URL when one exists, and drops to the coloured monogram SVG tile otherwise (or
// if the image fails to load). Mounted fresh per company (button key includes the
// ticker), so the failed state always starts clean.
function CompanyLogo({ company }: { company: Company }) {
  const [failed, setFailed] = useState(false);

  if (!company.logo || failed) {
    return (
      <svg className="wl-row__logo" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="6" fill={company.color} />
        <text
          x="16"
          y="21"
          textAnchor="middle"
          fill="#ffffff"
          fontFamily="Inter, Arial, sans-serif"
          fontSize="13"
          fontWeight="600"
        >
          {company.mark}
        </text>
      </svg>
    );
  }
  return (
    <img
      className="wl-row__logo"
      src={company.logo}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function FilterChip({ count }: { count: number }) {
  return (
    <button type="button" className="wl-filter">
      <span className="wl-filter__label">Filter</span>
      <span className="wl-filter__badge">{count}</span>
      <svg width="6" height="4" viewBox="0 0 6 4" aria-hidden>
        <path d="M0.5 0.5 3 3 5.5 0.5" fill="none" stroke="currentColor" strokeWidth="0.7" />
      </svg>
    </button>
  );
}

export default function WatchlistPage() {
  const [query, setQuery] = useState("");
  // Debounce the raw input so the (fuzzy) search only runs after the user pauses.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 140);
    return () => clearTimeout(t);
  }, [query]);

  // Subtle cursor-reactive tilt + translate on the Followed Companies card.
  const cardRef = useRef<HTMLDivElement>(null);
  const tiltRaf = useRef(0);
  const onCardMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1; // -1..1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1; // -1..1
    if (!tiltRaf.current) {
      tiltRaf.current = requestAnimationFrame(() => {
        tiltRaf.current = 0;
        el.style.transform =
          `perspective(700px) rotateX(${(-ny * 2.6).toFixed(2)}deg) ` +
          `rotateY(${(nx * 2.6).toFixed(2)}deg) ` +
          `translate3d(${(nx * 3).toFixed(2)}px, ${(ny * 3 - 2).toFixed(2)}px, 0)`;
      });
    }
  };
  const resetCardTilt = () => {
    if (tiltRaf.current) {
      cancelAnimationFrame(tiltRaf.current);
      tiltRaf.current = 0;
    }
    if (cardRef.current) cardRef.current.style.transform = "";
  };

  const results = useMemo(() => searchCompanies(debounced), [debounced]);

  return (
    <section className="wpage">
      <div className="wpage__tabs">
        <button type="button" className="wpage__tab wpage__tab--active">
          Chat
        </button>
        <button type="button" className="wpage__tab">
          History
        </button>
      </div>

      <div className="wpage__body">
        {/* Search Companies */}
        <section className="wl-search">
          <header className="wl-head">
            <h3 className="wl-heading">Search Companies</h3>
            <FilterChip count={2} />
          </header>

          <div className="wl-searchbox">
            <svg
              className="wl-searchbox__icon"
              width="8"
              height="8"
              viewBox="0 0 8 8"
              aria-hidden
            >
              <circle cx="3.4" cy="3.4" r="2.6" fill="none" stroke="currentColor" strokeWidth="0.9" />
              <line x1="5.3" y1="5.3" x2="7.2" y2="7.2" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
            </svg>
            <input
              className="wl-searchbox__input"
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="wl-searchbox__clear"
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            )}
          </div>

          <div className="wl-results">
            {results.map((c, i) => (
              <button type="button" className="wl-row" key={`${c.ticker}-${i}`}>
                <CompanyLogo company={c} />
                <span className="wl-row__name">{c.name}</span>
                <span className="wl-row__ticker">{c.ticker}</span>
              </button>
            ))}
            {results.length === 0 && (
              <p className="wl-results__empty">No companies found</p>
            )}
          </div>
        </section>

        {/* Followed Companies */}
        <section className="wl-followed">
          <header className="wl-head">
            <h3 className="wl-heading">Followed Companies</h3>
            <FilterChip count={4} />
          </header>
          <p className="wl-count">10 Companies</p>

          <div
            className="wl-followed__card"
            ref={cardRef}
            onMouseMove={onCardMove}
            onMouseLeave={resetCardTilt}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div className="wl-skel" key={i}>
                <span className="wl-skel__thumb" />
                <span className="wl-skel__bar" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
