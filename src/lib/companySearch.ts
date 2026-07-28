// Mock company universe + a functional fuzzy search for the Watchlist search bar.
//
// Every company gets a self-contained SVG monogram icon (a coloured rounded tile
// with the company's initials) generated as a data-URI — no external assets.
//
// Search ranking (matches the product spec) evaluates the query against each
// company's name AND ticker and keeps the best of the two, sorted into tiers:
//   Tier 1 — query is a PREFIX of the target (same order, at the beginning)
//   Tier 2 — query is a contiguous SUBSTRING but not at the start (same order)
//   Tier 3 — query chars appear as an in-order SUBSEQUENCE (scattered, same order)
//   Tier 4 — close fuzzy match (approximate-substring Levenshtein under a threshold)
// The result set is always padded/trimmed to exactly RESULT_COUNT entries; with an
// empty query it shows the trending list.

import { NSE_EQUITIES } from "./nseEquities";
import { LOGO_URLS } from "./companyLogos";

export interface Company {
  name: string;
  ticker: string;
  mark: string; // 1–2 letter monogram initials (fallback icon)
  color: string; // monogram tile colour (fallback icon)
  logo: string; // verified real brand-logo URL, or "" when none exists
}

export const RESULT_COUNT = 8;

// ---------------------------------------------------------------------------
// Monogram icon generation
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  "ltd",
  "limited",
  "the",
  "of",
  "and",
  "co",
  "company",
  "corp",
  "corporation",
  "india",
  "indian",
]);

function initials(name: string): string {
  const words = name
    .replace(/[.'’&]/g, " ")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w) && !STOPWORDS.has(w.toLowerCase()));
  const picked = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return (picked.join("") || name.slice(0, 2).toUpperCase()).slice(0, 2);
}

// Deterministic monogram tile colour: hash the ticker into a fixed palette so a
// company always gets the same pleasant, sufficiently-dark colour.
const PALETTE = [
  "#0a3d91", "#1a48c4", "#004c8f", "#007cc3", "#2b6cb0", "#1d4ed8",
  "#0369a1", "#0e7490", "#16569e", "#334155", "#5c2d91", "#6d28d9",
  "#7c3aed", "#97144d", "#b91c1c", "#dc2626", "#e03a3e", "#b45309",
  "#a16207", "#d97706", "#0e7a3b", "#059669", "#2f7d32", "#0f766e",
];
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

// The full universe of NSE-listed equities (2026), each with a monogram fallback
// and — for the well-known names — a verified real brand-logo URL.
export const COMPANIES: Company[] = NSE_EQUITIES.map(([ticker, name]) => ({
  name,
  ticker,
  mark: initials(name),
  color: colorFor(ticker),
  logo: LOGO_URLS[ticker] ?? "",
}));

const BY_TICKER = new Map(COMPANIES.map((c) => [c.ticker, c]));

// Trending companies shown when the search box is empty (large, well-known caps).
const TRENDING_TICKERS = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "ICICIBANK",
  "SBIN",
  "BHARTIARTL",
  "ITC",
];
const TRENDING: Company[] = TRENDING_TICKERS.map((t) => BY_TICKER.get(t)).filter(
  (c): c is Company => Boolean(c),
);

// ---------------------------------------------------------------------------
// Matching primitives
// ---------------------------------------------------------------------------

/** In-order subsequence test; returns the span (last-first index) when found. */
function subsequenceSpan(q: string, target: string): number | null {
  let first = -1;
  let last = -1;
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    let found = -1;
    while (ti < target.length) {
      if (target[ti] === ch) {
        found = ti;
        ti++;
        break;
      }
      ti++;
    }
    if (found === -1) return null;
    if (first === -1) first = found;
    last = found;
  }
  return last - first;
}

/**
 * Approximate-substring edit distance: the minimum number of edits to turn the
 * pattern `q` into SOME substring of `target`. First DP row is all zeros so the
 * match may start anywhere; the answer is the min over the last row.
 */
function fuzzySubstringDistance(q: string, target: string): number {
  const m = q.length;
  const n = target.length;
  if (m === 0) return 0;
  let prev = new Array(n + 1).fill(0);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i; // deleting i chars of the pattern
    for (let j = 1; j <= n; j++) {
      const cost = q[i - 1] === target[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        prev[j] + 1, // delete from pattern
        cur[j - 1] + 1, // insert into pattern
        prev[j - 1] + cost, // substitute / match
      );
    }
    [prev, cur] = [cur, prev];
  }
  let best = Infinity;
  for (let j = 0; j <= n; j++) best = Math.min(best, prev[j]);
  return best;
}

interface Rank {
  tier: number; // 1..4 matched, 99 = fuzzy fallback (for padding)
  primary: number; // in-tier tiebreak (lower is better)
  dist: number; // fuzzy distance, for global padding order
}

/** Best rank of the query against one target string. */
function rankTarget(q: string, target: string): Rank {
  const idx = target.indexOf(q);
  if (idx === 0) return { tier: 1, primary: target.length, dist: 0 };
  if (idx > 0) return { tier: 2, primary: idx, dist: 0 };

  const span = subsequenceSpan(q, target);
  if (span !== null) return { tier: 3, primary: span, dist: 0 };

  const dist = fuzzySubstringDistance(q, target);
  // allow ~1 edit per 3 chars (min 1) for a genuine tier-4 match
  const threshold = Math.max(1, Math.floor(q.length / 3));
  if (dist <= threshold) return { tier: 4, primary: dist, dist };
  return { tier: 99, primary: dist, dist };
}

function betterRank(a: Rank, b: Rank): Rank {
  if (a.tier !== b.tier) return a.tier < b.tier ? a : b;
  if (a.primary !== b.primary) return a.primary < b.primary ? a : b;
  return a.dist <= b.dist ? a : b;
}

// ---------------------------------------------------------------------------
// Public search
// ---------------------------------------------------------------------------
export function searchCompanies(query: string): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return TRENDING.slice(0, RESULT_COUNT);

  const scored = COMPANIES.map((c) => {
    const rank = betterRank(
      rankTarget(q, c.name.toLowerCase()),
      rankTarget(q, c.ticker.toLowerCase()),
    );
    return { c, rank };
  });

  scored.sort((a, b) => {
    if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
    if (a.rank.primary !== b.rank.primary)
      return a.rank.primary - b.rank.primary;
    if (a.rank.dist !== b.rank.dist) return a.rank.dist - b.rank.dist;
    if (a.c.name.length !== b.c.name.length)
      return a.c.name.length - b.c.name.length;
    return a.c.name.localeCompare(b.c.name);
  });

  // Always return exactly RESULT_COUNT: real matches first, padded with the
  // closest non-matches (already ordered by fuzzy distance in the sort above).
  return scored.slice(0, RESULT_COUNT).map((s) => s.c);
}
