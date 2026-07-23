import { useMemo, useState } from "react";
import { icons } from "../icons";
import "./WatchlistPage.css";

interface Company {
  name: string;
  ticker: string;
  logo: string;
}

const companies: Company[] = [
  { name: "Adani Enterprises Ltd.", ticker: "ADANIENT", logo: icons.wlAdaniEnt },
  { name: "Adani Power Ltd.", ticker: "ADANIPOWER", logo: icons.wlAdaniPower },
  { name: "Aditya Birla Capital Ltd.", ticker: "ABCAPITAL", logo: icons.wlAbCapital },
  { name: "Ambuja Cements Ltd.", ticker: "AMBUJACEM", logo: icons.wlAmbujaCem },
  { name: "Asian Paints Ltd.", ticker: "ASIANPAINT", logo: icons.wlAsianPaint },
  { name: "Ashok Leyland Ltd.", ticker: "ASHOKLEY", logo: icons.wlAshokLey },
  { name: "Axis Bank Ltd.", ticker: "AXISBANK", logo: icons.wlAxisBank },
  { name: "Axis Bank Ltd.", ticker: "AXISBANK", logo: icons.wlAxisBank },
];

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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q),
    );
  }, [query]);

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
                <img className="wl-row__logo" src={c.logo} alt="" />
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

          <div className="wl-followed__card">
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
