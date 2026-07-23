// News service for the Research Desk Spotlight.
//
// Right now this pulls from a free public news API so the UI shows real
// headlines/subtitles/images. Later this will point at our own backend — when
// that happens, only `fetchSpotlightNews` below needs to change; the rest of
// the app consumes the normalized `NewsArticle` shape and stays untouched.

export interface NewsArticle {
  id: string;
  headline: string;
  subtitle: string;
  image: string; // may be "" when the source has no image
  date: string; // e.g. "14 Jun"
  readTime: string; // e.g. "8min read"
  url: string;
  source?: string; // news-source name, e.g. "Reuters"
  sourceUrl?: string; // news-source site, used for its logo (favicon)
}

// Optional: set GNEWS_API_KEY in .env to get finance/business headlines
// (https://gnews.io — free tier, CORS-enabled). Without a key we fall back to
// a keyless public API so the UI still shows real news out of the box.
const GNEWS_KEY =
  (typeof process !== "undefined" && process.env && process.env.GNEWS_API_KEY) ||
  "";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Rough reading-time estimate at ~200 wpm from the text we have.
function estimateReadTime(...text: string[]): string {
  const words = text.join(" ").trim().split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins}min read`;
}

async function fetchFromGNews(limit: number): Promise<NewsArticle[]> {
  const url =
    `https://gnews.io/api/v4/top-headlines?category=business&lang=en` +
    `&max=${limit}&apikey=${GNEWS_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GNews ${res.status}`);
  const data = (await res.json()) as {
    articles?: Array<{
      title: string;
      description?: string;
      content?: string;
      image?: string;
      publishedAt: string;
      url: string;
    }>;
  };
  return (data.articles ?? []).map((a, i) => ({
    id: a.url || `gnews-${i}`,
    headline: a.title,
    subtitle: a.description ?? "",
    image: a.image ?? "",
    date: formatDate(a.publishedAt),
    readTime: estimateReadTime(a.description ?? "", a.content ?? ""),
    url: a.url,
  }));
}

// Keyless, CORS-enabled, free — Spaceflight News API. Real articles with
// title/summary/image, used as a zero-config default until GNEWS_API_KEY is set
// or our backend is wired up.
async function fetchFromSpaceflight(limit: number): Promise<NewsArticle[]> {
  const url = `https://api.spaceflightnewsapi.net/v4/articles/?limit=${limit}&ordering=-published_at`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Spaceflight ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      id: number;
      title: string;
      summary?: string;
      image_url?: string;
      published_at: string;
      url: string;
    }>;
  };
  return (data.results ?? []).map((a) => ({
    id: String(a.id),
    headline: a.title,
    subtitle: a.summary ?? "",
    image: a.image_url ?? "",
    date: formatDate(a.published_at),
    readTime: estimateReadTime(a.summary ?? ""),
    url: a.url,
  }));
}

/**
 * Fetch news articles for the Spotlight section, normalized to `NewsArticle`.
 * Prefers GNews business headlines when a key is present, otherwise falls back
 * to the keyless public API. Callers should handle the empty-array case (e.g.
 * network failure) by keeping their existing placeholder content.
 */
export async function fetchSpotlightNews(limit = 5): Promise<NewsArticle[]> {
  try {
    return GNEWS_KEY
      ? await fetchFromGNews(limit)
      : await fetchFromSpaceflight(limit);
  } catch (err) {
    console.warn("[news] fetch failed, using placeholder content:", err);
    return [];
  }
}

/**
 * Fetch news scoped to a set of companies (the ones the user follows, i.e. the
 * treemap tiles). Uses GNews' search endpoint (needs GNEWS_API_KEY). Returns an
 * empty array when no key is set or on failure — callers should fall back to
 * their own per-company placeholder content.
 */
export async function fetchCompanyNews(
  companies: string[],
  limit = 4,
): Promise<NewsArticle[]> {
  if (companies.length === 0) return [];
  try {
    const q = companies.map((c) => `"${c}"`).join(" OR ");
    // Hits our own /api/company-news proxy (keeps the GNews key server-side).
    const res = await fetch(
      `/api/company-news?q=${encodeURIComponent(q)}&max=${limit}`,
    );
    if (!res.ok) throw new Error(`company-news ${res.status}`);
    const data = (await res.json()) as {
      articles?: Array<{
        title: string;
        description?: string;
        content?: string;
        image?: string;
        publishedAt: string;
        url: string;
        source?: { name?: string; url?: string };
      }>;
    };
    return (data.articles ?? []).map((a, i) => ({
      id: a.url || `co-news-${i}`,
      headline: a.title,
      subtitle: a.description ?? "",
      image: a.image ?? "",
      date: formatDate(a.publishedAt),
      readTime: estimateReadTime(a.description ?? "", a.content ?? ""),
      url: a.url,
      source: a.source?.name,
      sourceUrl: a.source?.url,
    }));
  } catch (err) {
    console.warn("[news] company fetch failed:", err);
    return [];
  }
}
