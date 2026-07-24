import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { icons } from "../icons";
import {
  fetchCompanyNews,
  fetchSpotlightNews,
  type NewsArticle,
} from "../services/news";
import Treemap, { trackedCompanies } from "./Treemap";
import "./ResearchDesk.css";

// Placeholder News cards scoped to the followed companies (treemap tiles), shown
// until (or if) the company-news fetch returns real articles.
const companyFallbackPosts: NewsArticle[] = trackedCompanies
  .slice(0, 4)
  .map((c, i) => ({
    id: `co-fallback-${i}`,
    headline: `${c.name.charAt(0) + c.name.slice(1).toLowerCase()} — latest coverage`,
    subtitle: "",
    image: "",
    date: "",
    readTime: "",
    url: `https://${c.domain}`,
  }));

interface EventItem {
  title: string;
  desc: string;
  img?: string;
}

const jun1: EventItem[] = [
  {
    title: "Dow Jones | Nasdaq | US Stock Mark...",
    desc: "Dow Jones Today | US Stock Market Live: U.S. stock futures advanced on Tuesday, with chipmakers extending their rally for a second str...",
    img: icons.rdDowJones,
  },
  {
    title: "AMCA tender issued, HAL sits ou...",
    desc: "Going by current timeline, five prototypes of India's own 5th-gen fighter are set to be rolled out by 2...",
    img: icons.rdAmca,
  },
  {
    title: "India-US trade deal can be finalis...",
    desc: "India is pushing for preferential new tariffs from the United States as part of talks to finalise an interi...",
    img: icons.rdIndiaUs,
  },
  {
    title: "Dow Jones | Nasdaq | US Stock Mark...",
    desc: "Dow Jones Today | US Stock Market Live: U.S. stock futures advanced on Tuesday, with chipmakers extending their rally for a second str...",
    img: icons.rdDowJones,
  },
];

const jun2: EventItem[] = [
  {
    title: "Excessive AI Use Is Like 'Porn Addicti...",
    desc: "Alex Karp argued that organisations have prioritised increasing token consumption over assessing...",
    img: icons.rdKarp,
  },
  {
    title: "Why Adani is onboarding L&T for nuc...",
    desc: "Adani is in talks with the L&T group for the construction of a nuclear power plant as it finalises poss...",
    img: icons.rdAdani,
  },
  {
    title: "Zomato introduces low-plastic packa...",
    desc: "Celebrating World Environment Day, Zomato has launched a feature designed to help eco-consc...",
    img: icons.rdZomato,
  },
  {
    title: "Paras Defence, BEL, HAL gain up to 5...",
    desc: "Adding to the positive sentiment, JM Financial Institutional Securities reiterated its 'Buy' rating...",
    img: icons.rdParas,
  },
  {
    title: "Market rally extends to fourth week; r...",
    desc: "Foreign Institutional Investors (FIIs) sold equities worth around ₹4,000 crore during the week, w...",
    img: icons.rdMarket,
  },
];

// Progressive blur on the spotlight image: stacked copies with increasing blur
// radius, each masked to an overlapping band, so the blur RAMPS from ~sharp at
// the top to heavy at the bottom (a real gradient blur, not one uniform layer).
const SPOT_BLUR_LAYERS: { blur: number; mask: string }[] = [
  { blur: 18, mask: "linear-gradient(to top, #000 0%, #000 14%, transparent 30%)" },
  {
    blur: 11,
    mask: "linear-gradient(to top, transparent 8%, #000 22%, #000 36%, transparent 50%)",
  },
  {
    blur: 6,
    mask: "linear-gradient(to top, transparent 28%, #000 42%, #000 56%, transparent 70%)",
  },
  {
    blur: 3,
    mask: "linear-gradient(to top, transparent 48%, #000 62%, #000 76%, transparent 88%)",
  },
  {
    blur: 1.5,
    mask: "linear-gradient(to top, transparent 66%, #000 82%, transparent 98%)",
  },
];

// Shown while news is loading or if the fetch fails, so the layout never breaks.
const fallbackArticle: NewsArticle = {
  id: "fallback",
  headline:
    "West Asia LIVE: 'Deep mistrust' in U.S. remains despite deal, says Iran's foreign ministry",
  subtitle:
    "Tensions persist across the region as diplomatic channels remain strained despite the latest agreement.",
  image: icons.spotlight,
  date: "14 Jun",
  readTime: "8min read",
  url: "#",
};

const fallbackPosts: NewsArticle[] = [0, 1, 2, 3].map((i) => ({
  ...fallbackArticle,
  id: `fallback-post-${i}`,
  date: "10 Jun",
}));

// Wraps a card so it tilts and drifts subtly toward the cursor while hovered
// (the whole card reacts to mouse movement), easing back to rest on leave via
// CSS. Kept gentle: a small tilt plus a very small x/y translate.
function TiltCard({
  className,
  children,
  maxTilt = 2.5,
  maxShift = 4,
}: {
  className?: string;
  children: ReactNode;
  maxTilt?: number;
  maxShift?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const st = useRef({ nx: 0, ny: 0, hover: false, pressed: false });

  const apply = () => {
    raf.current = 0;
    const el = ref.current;
    if (!el) return;
    const { nx, ny, hover, pressed } = st.current;
    if (!hover && !pressed) {
      el.style.transform = "";
      return;
    }
    const s = pressed ? 0.955 : 1; // press → subtle scale-down
    el.style.transform =
      `perspective(1200px) rotateX(${(-ny * maxTilt).toFixed(2)}deg) rotateY(${(nx * maxTilt).toFixed(2)}deg)` +
      ` translate3d(${(nx * maxShift).toFixed(2)}px, ${(ny * maxShift).toFixed(2)}px, 0) scale(${s})`;
  };
  const schedule = () => {
    if (!raf.current) raf.current = requestAnimationFrame(apply);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    st.current.nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
    st.current.ny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2));
    st.current.hover = true;
    schedule();
  };
  const onMouseLeave = () => {
    st.current.hover = false;
    st.current.pressed = false;
    schedule();
  };
  const onMouseDown = () => {
    st.current.pressed = true;
    schedule();
  };
  const onMouseUp = () => {
    st.current.pressed = false;
    schedule();
  };

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      {children}
    </div>
  );
}

function FilterChip({ count }: { count: number }) {
  return (
    <button type="button" className="rdesk__filter">
      <span>Filter</span>
      <span className="rdesk__filter-badge">{count}</span>
      <svg width="7" height="4" viewBox="0 0 7 4" aria-hidden>
        <path d="M0.5 0.5 3.5 3 6.5 0.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
      </svg>
    </button>
  );
}

function EventCard({
  item,
  style,
  onMouseEnter,
}: {
  item: EventItem;
  style?: CSSProperties;
  onMouseEnter?: () => void;
}) {
  return (
    <article className="rdesk-card" style={style} onMouseEnter={onMouseEnter}>
      {item.img ? (
        <img className="rdesk-card__thumb" src={item.img} alt="" />
      ) : (
        <div className="rdesk-card__thumb rdesk-card__thumb--empty" />
      )}
      <div className="rdesk-card__body">
        <h4 className="rdesk-card__title">{item.title}</h4>
        <p className="rdesk-card__desc">{item.desc}</p>
      </div>
    </article>
  );
}

// Reverse-indent pull (px) by distance from the hovered card: hovered pulls out
// most, the two cards on either side progressively less. Beyond ±2 → no pull.
const PULL_BY_DISTANCE = [16, 9, 4];

// Time constant (ms) of the exponential ease — higher = slower, smoother glide.
const PULL_TAU = 120;

function EventList({ items, keyPrefix }: { items: EventItem[]; keyPrefix: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const target = useRef<number[]>(items.map(() => 0));
  const current = useRef<number[]>(items.map(() => 0));
  const raf = useRef(0);
  const lastTs = useRef(0);

  // rAF loop: every card's --pull eases toward its target. One loop drives the
  // whole list, so when the hovered card changes, cards leaving and cards
  // arriving glide simultaneously and continuously (no per-card restart).
  const tick = (ts: number) => {
    const dt = lastTs.current ? Math.min(ts - lastTs.current, 50) : 16;
    lastTs.current = ts;
    const k = 1 - Math.exp(-dt / PULL_TAU); // frame-rate independent
    const cards = listRef.current?.children;
    let moving = false;
    for (let i = 0; i < current.current.length; i++) {
      const t = target.current[i] ?? 0;
      const prev = current.current[i] ?? 0;
      let c = prev + (t - prev) * k;
      if (Math.abs(t - c) < 0.05) c = t;
      else moving = true;
      current.current[i] = c;
      (cards?.[i] as HTMLElement | undefined)?.style.setProperty(
        "--pull",
        `${c.toFixed(2)}px`,
      );
    }
    raf.current = moving ? requestAnimationFrame(tick) : (lastTs.current = 0);
  };

  const setHovered = (h: number | null) => {
    for (let i = 0; i < target.current.length; i++) {
      target.current[i] =
        h === null ? 0 : (PULL_BY_DISTANCE[Math.abs(i - h)] ?? 0);
    }
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  };

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  return (
    <div
      className="rdesk__list"
      ref={listRef}
      onMouseLeave={() => setHovered(null)}
    >
      {items.map((item, i) => (
        <EventCard
          key={`${keyPrefix}${i}`}
          item={item}
          onMouseEnter={() => setHovered(i)}
        />
      ))}
    </div>
  );
}

export default function ResearchDesk() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  // News about the companies the user follows (the treemap tiles).
  const [companyNews, setCompanyNews] = useState<NewsArticle[]>([]);

  useEffect(() => {
    let active = true;
    fetchSpotlightNews(5).then((news) => {
      if (active && news.length) setArticles(news);
    });
    fetchCompanyNews(
      trackedCompanies.map((c) => c.name),
      4,
    ).then((news) => {
      if (active && news.length) setCompanyNews(news);
    });
    return () => {
      active = false;
    };
  }, []);

  // First article is the hero; the rest fill the "Latest Post" list.
  const spotlight = articles[0] ?? fallbackArticle;
  const latestPosts = (articles.length > 1 ? articles.slice(1, 5) : fallbackPosts).slice(0, 4);
  // News section: only the followed companies' news (falls back to per-company
  // placeholder cards until the company-news fetch resolves / if it's unavailable).
  const newsCards = (companyNews.length ? companyNews : companyFallbackPosts).slice(0, 4);

  return (
    <div className="rdesk">
      {/* Left: Upcoming Events */}
      <section className="rdesk__col rdesk__col--events">
        <header className="rdesk__head">
          <h3 className="rdesk__heading">Upcoming Events</h3>
          <FilterChip count={2} />
        </header>

        <p className="rdesk__date">1 Jun, 2026</p>
        <EventList items={jun1} keyPrefix="a" />

        <p className="rdesk__date">2 Jun, 2026</p>
        <EventList items={jun2} keyPrefix="b" />
      </section>

      {/* Right: Spotlight + Watchlist + News */}
      <section className="rdesk__col rdesk__col--spotlight">
        {/* Spotlight */}
        <header className="rdesk__head">
          <h3 className="rdesk__heading">Spotlight</h3>
          <FilterChip count={4} />
        </header>

        {/* invisible spacer matching the "1 Jun, 2026" date line so the
            Spotlight card aligns with the first Upcoming Events card */}
        <p className="rdesk__date rdesk__date--spacer" aria-hidden>
          &nbsp;
        </p>

        <TiltCard className="rdesk__spot-card">
          <figure className="rdesk__spot-media">
            <img
              src={spotlight.image || icons.spotlight}
              alt=""
              onError={(e) => {
                e.currentTarget.src = icons.spotlight;
              }}
            />
            {/* Progressive blur: stacked copies at increasing blur radius, each
                masked to a band, so the blur ramps sharp→heavy top→bottom. Mask on
                the wrapper, blur on the img (they don't compose on one element). */}
            <div className="rdesk__spot-blur" aria-hidden>
              {SPOT_BLUR_LAYERS.map((l, li) => (
                <div
                  key={li}
                  className="rdesk__spot-blur-band"
                  style={{ WebkitMaskImage: l.mask, maskImage: l.mask }}
                >
                  <img
                    src={spotlight.image || icons.spotlight}
                    alt=""
                    style={{ filter: `blur(${l.blur}px)` }}
                    onError={(e) => {
                      e.currentTarget.src = icons.spotlight;
                    }}
                  />
                </div>
              ))}
            </div>
            <figcaption className="rdesk__spot-info">
              <p className="rdesk__spot-title">{spotlight.headline}</p>
              {spotlight.subtitle && (
                <p className="rdesk__spot-subtitle">{spotlight.subtitle}</p>
              )}
              <p className="rdesk__spot-meta">
                <span>{spotlight.date}</span>
                <span className="rdesk__dot" />
                <span>{spotlight.readTime}</span>
              </p>
            </figcaption>
          </figure>

          <div className="rdesk__latest">
            <h4 className="rdesk__latest-head">Latest Post</h4>
            <div className="rdesk__latest-list">
              {latestPosts.map((post) => (
                <article key={post.id} className="rdesk__post">
                  {post.image ? (
                    <img
                      className="rdesk__post-thumb"
                      src={post.image}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : (
                    <div className="rdesk__post-thumb" />
                  )}
                  <div className="rdesk__post-body">
                    <p className="rdesk__post-title">{post.headline}</p>
                    <p className="rdesk__post-date">{post.date}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </TiltCard>

        {/* Watchlist */}
        <TiltCard className="rdesk__spot-card rdesk__spot-card--watch">
          <figure className="rdesk__spot-media rdesk__spot-media--treemap">
            <Treemap />
          </figure>

          <div className="rdesk__latest">
            <h4 className="rdesk__latest-head">Watchlist</h4>
            <div className="rdesk__latest-list">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rdesk__wrow">
                  <div className="rdesk__wrow-thumb" />
                  <div className="rdesk__wrow-lines">
                    <span />
                    <span />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TiltCard>

        {/* News */}
        <header className="rdesk__head rdesk__head--news">
          <h3 className="rdesk__heading">News</h3>
          <FilterChip count={4} />
        </header>
        <div className="rdesk__news">
          {newsCards.map((post, i) => {
            let host = "";
            try {
              host = new URL(post.sourceUrl || post.url).hostname.replace(
                /^www\./,
                "",
              );
            } catch {
              host = "";
            }
            const label = post.source || host;
            return (
              <TiltCard className="rdesk__news-card" key={post.id ?? i}>
                {post.image ? (
                  <img className="rdesk__news-thumb" src={post.image} alt="" />
                ) : (
                  <div className="rdesk__news-thumb rdesk__news-thumb--empty" />
                )}
                <h4 className="rdesk__news-title">{post.headline}</h4>
                {label && (
                  <div className="rdesk__news-source">
                    {host && (
                      <img
                        className="rdesk__news-logo"
                        src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
                        alt=""
                      />
                    )}
                    <span className="rdesk__news-src-name">{label}</span>
                  </div>
                )}
              </TiltCard>
            );
          })}
        </div>
      </section>
    </div>
  );
}
