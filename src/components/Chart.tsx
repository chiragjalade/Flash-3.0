import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import "./Chart.css";

// Charts rendered in a LaTeX / pgfplots aesthetic: each is a white "figure" with
// a black boxed frame, Computer-Modern-style serif type, tick marks, value
// labels, and a boxed legend — regardless of the app theme.
export type ChartType = "candlestick" | "line" | "bar";

const SERIF =
  '"Latin Modern Roman", "CMU Serif", "Computer Modern", "Latin Modern Math", Georgia, "Times New Roman", serif';

// The figure has no fill of its own (it blends with the page), so the ink adapts
// to the backdrop: dark ink on the light themes, light ink on the glass themes.
function themeInk() {
  const t =
    typeof document !== "undefined"
      ? (document.documentElement.getAttribute("data-theme") ?? "")
      : "";
  return t.includes("glass")
    ? {
        ink: "#e9eef5",
        line: "rgba(255, 255, 255, 0.18)",
        grid: "rgba(255, 255, 255, 0.08)",
      }
    : {
        ink: "#141414",
        line: "rgba(0, 0, 0, 0.16)",
        grid: "rgba(0, 0, 0, 0.07)",
      };
}

const UP = "#2f9e5b"; // bullish candle
const DOWN = "#cc3b46"; // bearish candle
const LINE = "#4646c8"; // line accent

// pgfplots-ish pastel palette: light fill, darker outline, matching label ink.
const SERIES = [
  { key: "used", name: "used", fill: "#c6c6f2", stroke: "#5a5ad8", ink: "#3535c0" },
  { key: "understood", name: "understood", fill: "#f7bcbc", stroke: "#e05555", ink: "#d23636" },
  { key: "notUnderstood", name: "not understood", fill: "#e8ddc4", stroke: "#b39a5e", ink: "#8f7838" },
] as const;

// Deterministic pseudo-random so the mock series stays stable across re-renders.
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Candle {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  range: [number, number];
}

function makeCandles(seed = 7, n = 20): Candle[] {
  const r = rng(seed);
  let price = 100;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(20, open + (r() - 0.47) * 7);
    const high = Math.max(open, close) + r() * 3;
    const low = Math.min(open, close) - r() * 3;
    out.push({ x: i, open, close, high, low, range: [low, high] });
    price = close;
  }
  return out;
}

function makeLine(seed = 3, n = 26) {
  const r = rng(seed);
  let v = 50;
  return Array.from({ length: n }, (_, i) => {
    v = Math.max(8, v + (r() - 0.45) * 9);
    return { x: i, value: Math.round(v * 10) / 10 };
  });
}

// Grouped bars mirroring the reference figure (used / understood / not understood).
const GROUPED = [
  { cat: "tool8", used: 7, understood: 4, notUnderstood: 1 },
  { cat: "tool9", used: 9, understood: 4, notUnderstood: 1 },
  { cat: "tool10", used: 4, understood: 4, notUnderstood: 1 },
];

// Custom bar shape: a thin high-low wick + a coloured open-close body.
function CandleShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Candle;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const up = close >= open;
  const color = up ? UP : DOWN;
  const scale = height / (high - low || 1);
  const openY = y + (high - open) * scale;
  const closeY = y + (high - close) * scale;
  const bodyTop = Math.min(openY, closeY);
  const bodyH = Math.max(Math.abs(closeY - openY), 1.5);
  const cx = x + width / 2;
  const bw = Math.max(Math.min(width * 0.6, 9), 2);
  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} stroke={color} />
    </g>
  );
}

function drawInDelay() {
  if (typeof document === "undefined") return 1300;
  const theme = document.documentElement.getAttribute("data-theme") ?? "";
  return theme.includes("glass") ? 1300 : 150;
}

// Boxed legend swatches (filled square + dark outline), serif labels.
function LatexLegend() {
  return (
    <div className="chart__legend">
      {SERIES.map((s) => (
        <span key={s.key} className="chart__legend-item">
          <span
            className="chart__legend-swatch"
            style={{ background: s.fill, borderColor: s.stroke }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export default function Chart({ type, seed = 7 }: { type: ChartType; seed?: number }) {
  const gradId = useId();
  const begin = useMemo(() => drawInDelay(), []);
  const { ink: INK, line: AXC, grid: GRIDC } = useMemo(themeInk, []);

  const tick = { fontSize: 10, fill: INK, fontFamily: SERIF };
  const axisLine = { stroke: AXC, strokeWidth: 1 } as const;
  const tickLine = { stroke: AXC, strokeWidth: 1 } as const;
  const yAxis = {
    width: 30,
    tick,
    axisLine,
    tickLine,
    tickCount: 5,
  };
  const xAxis = {
    dataKey: "x" as const,
    height: 16,
    tick,
    axisLine,
    tickLine,
    interval: "preserveStartEnd" as const,
    minTickGap: 22,
  };

  const candles = useMemo(() => makeCandles(seed), [seed]);
  const line = useMemo(() => makeLine(seed), [seed]);

  if (type === "candlestick") {
    const lo = Math.min(...candles.map((d) => d.low));
    const hi = Math.max(...candles.map((d) => d.high));
    const pad = (hi - lo) * 0.08;
    return (
      <div className="chart chart--latex chart--candle" style={{ "--reveal-delay": `${begin}ms` } as React.CSSProperties}>
        <ResponsiveContainer width="100%" height="100%" debounce={220}>
          <ComposedChart data={candles} margin={{ top: 8, right: 10, bottom: 2, left: 2 }}>
            <CartesianGrid vertical={false} stroke={GRIDC} />
            <XAxis {...xAxis} />
            <XAxis {...xAxis} xAxisId="t" orientation="top" tick={false} tickLine={false} height={1} />
            <YAxis {...yAxis} domain={[lo - pad, hi + pad]} tickFormatter={(v) => Math.round(v).toString()} />
            <YAxis yAxisId="r" orientation="right" domain={[lo - pad, hi + pad]} tick={false} tickLine={false} axisLine={axisLine} width={1} />
            <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "line") {
    return (
      <div className="chart chart--latex chart--line" style={{ "--reveal-delay": `${begin}ms` } as React.CSSProperties}>
        <ResponsiveContainer width="100%" height="100%" debounce={220}>
          <AreaChart data={line} margin={{ top: 8, right: 10, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={LINE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRIDC} />
            <XAxis {...xAxis} />
            <XAxis {...xAxis} xAxisId="t" orientation="top" tick={false} tickLine={false} height={1} />
            <YAxis {...yAxis} domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={(v) => Math.round(Number(v)).toString()} />
            <YAxis yAxisId="r" orientation="right" domain={["dataMin - 5", "dataMax + 5"]} tick={false} tickLine={false} axisLine={axisLine} width={1} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={LINE}
              strokeWidth={1.4}
              fill={`url(#${gradId})`}
              dot={false}
              isAnimationActive
              animationBegin={begin + 1180}
              animationDuration={950}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Grouped LaTeX bar chart (matches the reference figure).
  return (
    <div className="chart chart--latex chart--bars" style={{ "--reveal-delay": `${begin}ms` } as React.CSSProperties}>
      <ResponsiveContainer width="100%" height="100%" debounce={220}>
        <BarChart data={GROUPED} margin={{ top: 16, right: 12, bottom: 4, left: 4 }} barCategoryGap="22%" barGap={2}>
          <CartesianGrid vertical={false} stroke={GRIDC} />
          <XAxis dataKey="cat" height={16} tick={tick} axisLine={axisLine} tickLine={tickLine} />
          <XAxis dataKey="cat" xAxisId="t" orientation="top" tick={false} tickLine={false} height={1} axisLine={axisLine} />
          <YAxis
            width={44}
            tick={tick}
            axisLine={axisLine}
            tickLine={tickLine}
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            label={{ value: "#participants", angle: -90, position: "insideLeft", dy: 34, style: { fontFamily: SERIF, fontSize: 11, fill: INK } }}
          />
          <YAxis yAxisId="r" orientation="right" domain={[0, 10]} tick={false} tickLine={false} axisLine={axisLine} width={1} />
          <ReferenceLine y={10} stroke={AXC} strokeWidth={1} />
          {SERIES.map((s, si) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={s.fill}
              stroke={s.stroke}
              strokeWidth={1}
              isAnimationActive
              animationBegin={begin + 1200 + si * 240}
              animationDuration={460}
              animationEasing="ease-out"
            >
              <LabelList dataKey={s.key} position="top" fill={s.ink} style={{ fontFamily: SERIF, fontSize: 10 }} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* legend lives in its OWN space beneath the plot (not carved out of it) */}
      <LatexLegend />
    </div>
  );
}
