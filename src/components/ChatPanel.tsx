import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { icons } from "../icons";
import ResearchDesk from "./ResearchDesk";
import { type ChartType } from "./Chart";
import GenerativeChart from "./GenerativeChart";
import PillGlass from "./PillGlass";
import type { LConfig } from "../glassParams";
import "./ChatPanel.css";

// --- Mock conversation content ------------------------------------------------
// This is placeholder data so we can see how a streamed answer will look. Later
// the turns (thought time, text, and the rich blocks that the skeletons stand in
// for) will arrive from the API; the user's prompt will be sent there too.
interface Turn {
  id: number;
  prompt: string; // the user's message for this turn
  thought: string; // "Thought for 2.1s"
  paragraphs: string[];
  skeleton?: "cards" | "charts"; // rich content that streams in after the text
  charts?: [ChartType, ChartType]; // chart type for each of the two chart boxes
}

const MOCK_PROMPTS = [
  "Explain the dual momentum strategy and how it allocates between equities and bonds.",
  "How many delivery partners has the program onboarded so far?",
  "Summarise the drawdown profile across the last three market regimes.",
  "What signals does the strategy use to rotate positions?",
];

const MOCK_PARAS_A = [
  "Our program for delivery partners lets agents sign up for both pick-up and delivery services across India, and it has quickly become one of the most flexible ways to earn on your own schedule. Whether you ride a bike through a dense metro or drive a small van across a cluster of towns, the platform matches you with orders that fit your vehicle, your preferred zones, and the hours you actually want to work. There is no fixed roster and no minimum commitment, so you can log in for a couple of hours between other responsibilities or run full shifts during peak demand, and the app steadily adapts the flow of requests to whatever pace you set. Payouts are transparent and itemised for every trip, incentives stack on top of the base fare during busy windows, and a dedicated partner-success team is on hand whenever something on the road needs sorting out. It is a genuine opportunity to build a sustainable, self-directed income while helping customers across the country receive their parcels quickly and reliably.",
  "This program has enabled over 64,600+ partners across India to date. To start working with India's largest integrated logistics company, download our app and start earning today.",
  "Onboarding is designed to get you moving on the same day, and the whole flow usually takes under ten minutes from start to finish. You verify your identity with a government ID, add the bank account or wallet where you want your earnings to land, and complete a short interactive safety walkthrough that covers the basics of handling parcels, confirming drop-offs, and staying visible on the road at night. Once those steps are approved you are matched with your first trip almost immediately, and the app gently ramps up the volume of requests as it learns which areas you know best. You are never locked into a shift; you can go online, accept a few orders, and step away whenever you need to, and the system simply pauses new offers until you return. Everything from your documents to your training badges lives in one place, so if anything ever needs re-verifying you can handle it in a couple of taps without leaving the app.",
  "Earnings scale with the zones you cover and the time of day you're active. Peak windows around morning and evening carry surge incentives, and weekly streak bonuses reward partners who stay consistent.",
  "Every payout is broken down so there is never any guesswork about how a trip was priced. Inside the earnings tab you can open any completed delivery and see the base fare, the distance component, waiting time, customer tips, and each incentive listed on its own line, along with any fuel or charging reimbursement calculated automatically from the kilometres you actually logged. Cash-on-delivery amounts are reconciled against your ledger the moment you mark an order complete, so collected money is tracked cleanly and settled on your regular cycle with nothing left ambiguous at the end of a shift. Payouts land weekly by default, but an instant-cashout option is always available for a small fee when you need funds sooner, and a full statement can be downloaded for your own records or for a loan application whenever you ask for it. The goal is simple: you should be able to trust, down to the rupee, that what you earned is exactly what you are paid.",
  "Vehicle flexibility is built in — bikes, three-wheelers, and small vans all qualify — and the route engine sequences batched orders efficiently, adapting in real time to traffic and weather so you spend less time backtracking.",
  "Safety and support run underneath everything you do on the platform, quietly and around the clock. Insurance cover is active for the full duration of every assigned trip, the in-app help centre answers common questions instantly, and a dedicated partner-success team reviews escalations so disputes are resolved quickly and fairly rather than left hanging. Partners riding in flood- or heat-prone regions receive proactive advisories before conditions turn dangerous, and hazardous-condition surcharges apply automatically so nobody is ever asked to ride into unsafe weather for a flat rate. As you complete more deliveries and keep your rating strong, you unlock higher tiers that bring earlier access to peak slots, priority support, verified handling badges that customers can see, and referral rewards for bringing new partners onto the network. Community meetups and an online forum let experienced riders share local knowledge, and the highest-rated contributors are regularly invited to pilot new features before they roll out to everyone else.",
];
const MOCK_PARAS_B = [
  "Based on the momentum signals over the trailing 12 months, the strategy rotates between equities and treasuries, holding whichever asset shows the stronger relative and absolute momentum.",
  "Below is a breakdown of the historical allocation and the drawdown profile across the last three market regimes.",
  "During the first regime, a prolonged risk-on rally, the model stayed almost fully allocated to equities and captured the bulk of the upside with only shallow, short-lived pullbacks.",
  "The second regime introduced sharp volatility, and the absolute-momentum filter moved the book into treasuries ahead of the deepest leg down, sidestepping a meaningful portion of the drawdown.",
  "In the most recent regime the signals were mixed, producing a few whipsaw switches; net of costs the strategy still preserved capital and re-entered equities as trend strength recovered.",
];

// Which rich block each turn streams in — rotated so the demo shows all three
// chart types (candlestick, line, bar) plus the plain card blocks.
const CHART_SETS: ([ChartType, ChartType] | undefined)[] = [
  ["candlestick", "bar"],
  ["line", "candlestick"],
  undefined, // cards
  ["bar", "line"],
];

// Mock issuer used to format a text answer as an equity-research note.
const COMPANY = {
  name: "Meridian Logistics plc",
  tagline:
    "Delivery & fulfilment at national scale — initiating coverage at Overweight, PT ₹6,600",
  metrics: [
    ["Rating", "Overweight"],
    ["Price target", "₹6,600"],
    ["Mkt cap", "₹4.28bn"],
    ["Rev (FY)", "₹1.26bn"],
  ] as const,
  meta: [
    ["Ticker", "MERL.NS · MERL LN"],
    ["HQ", "Mumbai, India"],
    ["Price", "₹5,123"],
    ["Segment", "Integrated Logistics"],
    ["Date", "5 Aug 2026"],
  ] as const,
};

// Section headline above each summary paragraph (research-note style).
const REPORT_SECTIONS = [
  "Executive summary",
  "Scale & footprint",
  "Onboarding & activation",
  "Earnings & incentives",
  "Payouts & transparency",
  "Fleet & routing",
  "Safety & support",
  "Coverage & reliability",
  "Outlook",
];

let uid = 0;
function makeTurn(index: number, prompt: string): Turn {
  const thoughts = ["2.1s", "2.4s", "2.7s", "1.9s", "3.2s"];
  const charts = CHART_SETS[index % CHART_SETS.length];
  return {
    id: uid++,
    prompt: prompt || MOCK_PROMPTS[index % MOCK_PROMPTS.length]!,
    thought: thoughts[index % thoughts.length]!,
    paragraphs: index % 2 === 0 ? MOCK_PARAS_A : MOCK_PARAS_B,
    skeleton: charts ? "charts" : undefined,
    charts,
  };
}

// The small sparkle + chevron shown on the "Thought for …" line.
function ThoughtLine({ time }: { time: string }) {
  return (
    <div className="msg__thought">
      <svg className="msg__spark" viewBox="0 0 10 10" aria-hidden>
        <path
          d="M5 0.6 6 4 9.4 5 6 6 5 9.4 4 6 0.6 5 4 4Z"
          fill="currentColor"
        />
      </svg>
      <span>Thought for {time}</span>
      <svg className="msg__chev" viewBox="0 0 8 5" aria-hidden>
        <path
          d="M1 1 4 4 7 1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// Copy / share action row under a response.
function MsgActions() {
  return (
    <div className="msg__actions">
      <button type="button" className="msg__act" aria-label="Copy">
        <svg viewBox="0 0 14 14" aria-hidden>
          <rect x="4.2" y="4.2" width="7.3" height="7.3" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M9.4 4.2V3.1a1.4 1.4 0 0 0-1.4-1.4H3.1a1.4 1.4 0 0 0-1.4 1.4v4.9a1.4 1.4 0 0 0 1.4 1.4h1.1" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className="msg__act" aria-label="Share">
        <svg viewBox="0 0 14 14" aria-hidden>
          <path d="M2 8.5V11a1.3 1.3 0 0 0 1.3 1.3h7.4A1.3 1.3 0 0 0 12 11V8.5" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <path d="M7 9V2M4.3 4.4 7 1.7l2.7 2.7" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

type Span = "half" | "full";

// Skeleton placeholders standing in for rich content (charts / cards). The chart
// boxes now host live charts — but only in the sharp foreground layer. In the
// goo "gel" layer (`gel`) the boxes stay empty white shapes, so the chart isn't
// smeared by the goo filter and the two layers stay dimensionally identical.
//
// The two chart boxes are EQUAL size by default. Each has a `span` (half/full);
// clicking one toggles it wider, and the grid wraps so the other stacks below.
// The parent (AnswerBlock) owns the spans + the FLIP animation so both the gel
// and fg copies move in lockstep.
function Skeleton({
  kind,
  charts,
  gel,
  spans,
  onToggle,
}: {
  kind: NonNullable<Turn["skeleton"]>;
  charts?: [ChartType, ChartType];
  gel?: boolean;
  spans: [Span, Span];
  onToggle?: (i: number) => void;
}) {
  const seeds = [7, 19];
  if (kind === "charts") {
    return (
      <div className="skel-charts">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="skel skel--chart"
            data-span={spans[i]}
            data-chart={charts?.[i]}
            onClick={gel ? undefined : () => onToggle?.(i)}
            title={gel ? undefined : "Click to resize"}
          >
            {!gel && charts && (
              <GenerativeChart kind={charts[i]!} seed={seeds[i]!} />
            )}
            {/* Copy/share live INSIDE the left card's bottom. Rendered in BOTH
                layers: as dark goo circles in the gel (fused into the card's goo
                blob, so they neck OUT of the card edge as they slide down) and as
                icons + fading glass circle in the fg. */}
            {i === 0 && <MsgActions />}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="skel-cards">
      <div className="skel skel--card" />
      <div className="skel skel--card" />
    </div>
  );
}

// One AI response. It first appears as a single unified box (thought + text +
// skeletons + actions all merged); after a short delay it flips to `--split`,
// and CSS transitions separate the pieces out — the thought lifts to plain text,
// the text keeps the box, the skeletons drop below, and the actions round into
// standalone white buttons.
// The answer's layout, rendered TWICE: once as the goo "gel" (white shapes, no
// text) and once as the sharp foreground (text/icons, transparent boxes). Both
// share the exact same flow + translate, so they stay perfectly aligned.
function AnswerBody({
  turn,
  gel,
  spans,
  onToggle,
}: {
  turn: Turn;
  gel?: boolean;
  spans: [Span, Span];
  onToggle?: (i: number) => void;
}) {
  // Text turns render as an equity-research note (header + rule + summary with
  // two side charts). Chart turns keep the intro + separate chart cards.
  if (turn.skeleton !== "charts") {
    return (
      <>
        <ThoughtLine time={turn.thought} />
        <div className="msg__content msg__content--actions report">
          <div className="report__head">
            <div className="report__title">
              <h3 className="report__company">{COMPANY.name}</h3>
              <p className="report__tagline">{COMPANY.tagline}</p>
              <div className="report__metrics">
                {COMPANY.metrics.map(([k, v]) => (
                  <span className="report__metric" key={k}>
                    <span className="report__metric-k">{k}</span>
                    <span className="report__metric-v">{v}</span>
                  </span>
                ))}
              </div>
            </div>
            <dl className="report__meta">
              {COMPANY.meta.map(([k, v]) => (
                <div className="report__meta-row" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <hr className="report__rule" />
          <div className="report__body">
            {/* Floated sidebar: charts + table. The summary text wraps around it
                and continues full-width below, filling any empty space. */}
            <aside className="report__side">
              <figure className="report__chart">
                {!gel && <GenerativeChart kind="line" seed={5} />}
                <figcaption>Price performance</figcaption>
              </figure>
              <figure className="report__chart">
                {!gel && <GenerativeChart kind="bar" seed={11} />}
                <figcaption>Revenue by segment</figcaption>
              </figure>
              <div className="report__table">
                <table>
                  <thead>
                    <tr>
                      <th>FYE Aug</th>
                      <th>2024A</th>
                      <th>2025E</th>
                      <th>2026E</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Adj EPS (₹)</td><td>57.2</td><td>77.9</td><td>102.3</td></tr>
                    <tr><td>Revenue (₹m)</td><td>1,264</td><td>1,545</td><td>1,910</td></tr>
                    <tr><td>EBITDA (₹m)</td><td>81</td><td>108</td><td>140</td></tr>
                    <tr><td>EBIT (₹m)</td><td>63</td><td>84</td><td>113</td></tr>
                    <tr><td>EBIT margin</td><td>6.3%</td><td>6.7%</td><td>7.3%</td></tr>
                  </tbody>
                </table>
                <div className="report__table-cap">Key financials</div>
              </div>
            </aside>
            <div className="msg__body report__text">
              {turn.paragraphs.map((p, i) => (
                <section key={i} className="report__section">
                  <h4 className="report__section-head">
                    {REPORT_SECTIONS[i % REPORT_SECTIONS.length]}
                  </h4>
                  <p>{p}</p>
                </section>
              ))}
            </div>
          </div>
          <MsgActions />
        </div>
      </>
    );
  }

  return (
    <>
      <ThoughtLine time={turn.thought} />
      <div className="msg__content">
        <div className="msg__body">
          {turn.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
      <Skeleton
        kind="charts"
        charts={turn.charts}
        gel={gel}
        spans={spans}
        onToggle={onToggle}
      />
    </>
  );
}

function AnswerBlock({ turn }: { turn: Turn }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false); // stage 1: skeletons separate (Y)
  const [xSplit, setXSplit] = useState(false); // stage 2: the chart pair splits (width)
  const [btnSplit, setBtnSplit] = useState(false); // stage 3: buttons separate (Y)
  // How far (px) to lift the skeletons / buttons up so they sit BEHIND (fused
  // into) the content box while merged; on split they slide back down to Y=0. The
  // goo filter necks them apart as they go. Only Y position changes, never size.
  const [off, setOff] = useState({ skel: 0, act: 0 });

  // Live chart sizing: both boxes equal by default; toggling one to "full" makes
  // it span the row and pushes the other down to stack. A FLIP pass animates the
  // reflow smoothly across BOTH the gel + fg copies so the white box and the
  // chart move together.
  const [spans, setSpans] = useState<[Span, Span]>(["half", "half"]);
  const flipPrev = useRef<Map<Element, DOMRect>>(new Map());
  const flipKey = useRef(0);

  const toggleSpan = (i: number) => {
    const boxes = groupRef.current?.querySelectorAll<HTMLElement>(".skel--chart");
    const m = new Map<Element, DOMRect>();
    boxes?.forEach((el) => m.set(el, el.getBoundingClientRect()));
    flipPrev.current = m;
    flipKey.current += 1;
    setSpans((s) => {
      const next: [Span, Span] = [s[0], s[1]];
      next[i] = s[i] === "full" ? "half" : "full";
      return next;
    });
  };

  useLayoutEffect(() => {
    if (flipKey.current === 0) return; // skip the first (mount) layout
    const boxes = groupRef.current?.querySelectorAll<HTMLElement>(".skel--chart");
    boxes?.forEach((el) => {
      const before = flipPrev.current.get(el);
      if (!before) return;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      const sx = after.width ? before.width / after.width : 1;
      const sy = after.height ? before.height / after.height : 1;
      if (
        Math.abs(dx) < 1 &&
        Math.abs(dy) < 1 &&
        Math.abs(sx - 1) < 0.02 &&
        Math.abs(sy - 1) < 0.02
      )
        return;
      el.style.transition = "none";
      el.style.transformOrigin = "left top";
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      void el.offsetWidth; // force the "before" frame
      requestAnimationFrame(() => {
        el.style.transition = "transform 0.55s cubic-bezier(0.45, 0, 0.15, 1)";
        el.style.transform = "";
      });
    });
  }, [spans]);

  useLayoutEffect(() => {
    const fg = groupRef.current?.querySelector<HTMLElement>(".msg__fg");
    if (!fg) return;
    const content = fg.querySelector<HTMLElement>(".msg__content");
    const skel = fg.querySelector<HTMLElement>(".skel-cards, .skel-charts");
    // only the STANDALONE action row (direct child) tucks/merges; chart turns
    // put the buttons inside the card, so this is null for them.
    const actions = fg.querySelector<HTMLElement>(":scope > .msg__actions");
    if (!content) return;
    // Merged layout: each piece tucks OVERLAP px under the bottom of the piece
    // above it (a clean stacked grid the goo necks together), rather than all
    // piling onto the content box. Translates are cumulative (up the stack).
    const OVERLAP = 8;
    let prevBottom = content.offsetTop + content.offsetHeight;
    let prevY = 0;
    let skelY = 0;
    let actY = 0;
    if (skel) {
      skelY = prevY - OVERLAP - (skel.offsetTop - prevBottom);
      prevY = skelY;
      prevBottom = skel.offsetTop + skel.offsetHeight;
    }
    if (actions) {
      actY = prevY - OVERLAP - (actions.offsetTop - prevBottom);
    }
    setOff({ skel: skelY, act: actY });
  }, []);

  useEffect(() => {
    const t1 = window.setTimeout(() => setSplit(true), 1260); // skeletons drop out
    // then the two side-by-side chart placeholders shrink/neck apart in width
    const t2 = window.setTimeout(() => setXSplit(true), 2700);
    // buttons come out LAST — for chart turns they slide out of the card only
    // after it has fully settled in.
    const t3 = window.setTimeout(
      () => setBtnSplit(true),
      turn.skeleton === "charts" ? 4700 : turn.skeleton ? 3800 : 1800,
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [turn.skeleton]);

  return (
    <div
      ref={groupRef}
      className={`msg__group${split ? " msg__group--split" : ""}${xSplit ? " msg__group--xsplit" : ""}${btnSplit ? " msg__group--btnsplit" : ""}`}
      style={
        {
          "--skel-y": `${off.skel}px`,
          "--act-y": `${off.act}px`,
        } as React.CSSProperties
      }
    >
      <div className="msg__gel" aria-hidden>
        <AnswerBody turn={turn} gel spans={spans} />
      </div>
      <div className="msg__fg">
        <AnswerBody turn={turn} spans={spans} onToggle={toggleSpan} />
      </div>
    </div>
  );
}

// User message shown as a dark liquid-glass bubble. A specular sheen + a
// cursor-following glare (set from pointer position) give it the "liquid" feel.
function UserBubble({ text }: { text: string }) {
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    el.style.setProperty("--glow", "1");
  };
  const onLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty("--glow", "0");
  };
  return (
    <div className="msg__bubble" onMouseMove={onMove} onMouseLeave={onLeave}>
      <span className="msg__bubble-txt">{text}</span>
    </div>
  );
}

// The prompt input box — reused centered in the hero and docked at the bottom
// of a conversation.
function PromptBox({
  onSend,
  docked,
  glass,
}: {
  onSend: (text: string) => void;
  docked?: boolean;
  glass?: LConfig;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight is content + padding and EXCLUDES the border, but the box is
    // border-box, so the border has to be added back or the field ends up short
    // by exactly that much and scrolls early. Liquid Glass gives the pill a 24px
    // transparent vertical border (it insets the scroll clip — see
    // liquid-glass.css), which turns a latent 2px discrepancy into a visible one.
    const cs = getComputedStyle(el);
    const borderY =
      (parseFloat(cs.borderTopWidth) || 0) +
      (parseFloat(cs.borderBottomWidth) || 0);
    el.style.height = `${el.scrollHeight + borderY}px`;
  };

  const submit = () => {
    const el = inputRef.current;
    const text = el?.value.trim() ?? "";
    onSend(text);
    if (el) {
      el.value = "";
      el.style.height = "auto";
    }
  };

  return (
    <form
      className={`prompt${docked ? " prompt--dock" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* Docked pill only: the hero prompt is already a WebGL glass surface, so
          it gets its refraction from GlassLayer's shader instead. */}
      {docked && <PillGlass targetRef={inputRef} config={glass} />}
      <textarea
        ref={inputRef}
        className="prompt__input"
        rows={1}
        placeholder="Add prompt instructions"
        /* Spellcheck off: the red squiggles are painted as part of the text, so
           #pill-glass-text displaces and stretches them along with the glyphs — a
           dotted line smeared 6x through the roll-off band reads as damage. */
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onInput={autoGrow}
      />
      <div className="prompt__row">
        <button type="button" className="prompt__attach" aria-label="Attach">
          +
        </button>
        <button type="submit" className="prompt__send" aria-label="Send">
          <img src={icons.sendArrow} alt="" />
        </button>
      </div>
    </form>
  );
}

export default function ChatPanel({ glass }: { glass?: LConfig } = {}) {
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [deskUp, setDeskUp] = useState(false);
  const [bounce, setBounce] = useState(false); // transient landing-bounce class
  const [turns, setTurns] = useState<Turn[]>([]); // conversation (empty = hero)
  const deskScrollRef = useRef<HTMLDivElement>(null);
  const convoRef = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0); // throttle toggles during the transition
  const firstRun = useRef(true);

  const inConversation = turns.length > 0;

  // Play the settle/stretch bounce whenever the desk rises or lowers.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setBounce(true);
    const t = window.setTimeout(() => setBounce(false), 900);
    return () => clearTimeout(t);
  }, [deskUp]);

  // Keep the conversation pinned to the latest turn.
  useEffect(() => {
    const el = convoRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // Signal the liquid-glass WebGL layer to frost the background photo while the
  // conversation is open (it reads this class each frame).
  useEffect(() => {
    document.documentElement.classList.toggle("chat-bg-blur", inConversation);
    return () => document.documentElement.classList.remove("chat-bg-blur");
  }, [inConversation]);

  // Submitting the prompt loads the conversation view. First submit seeds a
  // short demo thread so the layout is immediately visible; later sends append
  // a single turn (as a stream would).
  const handleSend = (text: string) => {
    setTurns((prev) => {
      // First submit seeds a short demo thread; the typed text (if any) drives
      // the first turn, the rest use mock prompts.
      if (prev.length === 0)
        return [0, 1, 2].map((i) => makeTurn(i, i === 0 ? text : ""));
      return [...prev, makeTurn(prev.length, text)];
    });
  };

  const newChat = () => setTurns([]);

  // Scrolling is a second way to bring the desk up / back down (hero only).
  const onWheel = (e: React.WheelEvent) => {
    if (inConversation) return;
    const now = Date.now();
    if (now < lockUntil.current) return;

    if (!deskUp) {
      if (e.deltaY > 12) {
        setDeskUp(true);
        lockUntil.current = now + 900;
      }
      return;
    }

    const el = deskScrollRef.current;
    if (e.deltaY < -12 && (!el || el.scrollTop <= 0)) {
      setDeskUp(false);
      lockUntil.current = now + 900;
    }
  };

  return (
    <section className="chat">
      <div className="chat__tabs">
        <button
          type="button"
          className={`chat__tab${activeTab === "chat" ? " chat__tab--active" : ""}`}
          onClick={() => {
            setActiveTab("chat");
            if (inConversation) newChat(); // clicking Chat starts a fresh thread
          }}
        >
          Chat
        </button>
        <button
          type="button"
          className={`chat__tab${activeTab === "history" ? " chat__tab--active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>

      {inConversation ? (
        /* --- Conversation view: streamed content + docked prompt --- */
        <div className="chat__convo-wrap">
          {/* Goo / metaball filter — fuses the white answer shapes and necks them
              apart as the skeletons/buttons separate out (like the clock merge). */}
          <svg
            width="0"
            height="0"
            aria-hidden
            style={{ position: "absolute" }}
          >
            <defs>
              <filter id="goo" x="-12%" y="-12%" width="124%" height="150%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 34 -18"
                  result="goo"
                />
                <feComposite in="SourceGraphic" in2="goo" operator="atop" />
              </filter>
              <filter id="goo-lg" x="-15%" y="-15%" width="130%" height="210%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11"
                  result="goo"
                />
                <feComposite in="SourceGraphic" in2="goo" operator="atop" />
              </filter>
            </defs>
          </svg>

          {/* Frosted layer above the background image — blurs the page backdrop
              behind the conversation (visible on the glass theme's photo). */}
          <div className="chat__bg-blur" aria-hidden />

          <div className="chat__convo" ref={convoRef}>
            <div className="chat__thread">
              {turns.map((t) => (
                <article className="msg" key={t.id}>
                  <div className="msg__user">
                    <UserBubble text={t.prompt} />
                  </div>
                  <AnswerBlock turn={t} />
                </article>
              ))}
            </div>
          </div>

          <div className="chat__dock">
            {/* Disappearing blur box — fades the thread into the docked prompt */}
            <div className="chat__dock-fade" aria-hidden />
            <PromptBox onSend={handleSend} docked glass={glass} />
          </div>
        </div>
      ) : (
        /* --- Hero view: headline + centered prompt + research desk --- */
        <div
          className={`chat__stage${deskUp ? " chat__stage--up" : ""}${bounce ? " chat__stage--bounce" : ""}`}
          onWheel={onWheel}
        >
          <div className="chat__hero">
            <h1 className="chat__headline">
              Research deeper. Understand faster.
              <br />
              Start with a question.
            </h1>

            <PromptBox onSend={handleSend} />

            <p className="chat__tagline">
              The AI that gets it right. Every single time.
            </p>
          </div>

          <button
            type="button"
            className="chat__pull"
            onClick={() => setDeskUp((v) => !v)}
            aria-label={deskUp ? "Lower research desk" : "Raise research desk"}
            aria-expanded={deskUp}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M3.5 8.5 7 5 10.5 8.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="chat__desk">
            <div className="chat__desk-scroll" ref={deskScrollRef}>
              <ResearchDesk />
            </div>
          </div>

          <div className="chat__blur" aria-hidden />
        </div>
      )}
    </section>
  );
}
