import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import "./Chart.css";

// A tiny, self-contained charting harness used to test how live charts feel
// inside the answer "placeholder" boxes. Later these will be produced by the
// generative-UI layer; for now they render mock finance series. Every chart is
// wrapped in a ResponsiveContainer so it always fills (and adapts to) whatever
// size the placeholder box happens to be, and animates in smoothly.
export type ChartType = "candlestick" | "line" | "bar";

const UP = "#10b981"; // bullish candle / positive
const DOWN = "#f43f5e"; // bearish candle / negative
const LINE = "#3b82f6"; // line + area accent
const BAR = "#6366f1"; // bar accent
const AXIS = "rgba(226, 232, 240, 0.72)"; // axis tick numbers (on dark glass)
const GRID = "rgba(255, 255, 255, 0.1)"; // faint horizontal grid lines (on dark glass)

// Shared axis styling so every chart shows readable numbers.
const tick = { fontSize: 9, fill: AXIS } as const;
const yAxisProps = {
  width: 30,
  tick,
  axisLine: false,
  tickLine: false,
  tickCount: 4,
} as const;
const xAxisProps = {
  dataKey: "x" as const,
  height: 14,
  tick,
  axisLine: false,
  tickLine: false,
  interval: "preserveStartEnd" as const,
  minTickGap: 24,
};

// Deterministic pseudo-random so the mock series stays stable across re-renders
// (resize/re-measure) instead of jumping around.
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

function makeCandles(seed = 7, n = 22): Candle[] {
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

function makeLine(seed = 3, n = 32) {
  const r = rng(seed);
  let v = 50;
  return Array.from({ length: n }, (_, i) => {
    v = Math.max(8, v + (r() - 0.45) * 9);
    return { x: i, value: Math.round(v * 10) / 10 };
  });
}

function makeBars(seed = 11, n = 9) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    x: i,
    value: Math.round(22 + r() * 78),
  }));
}

// Custom bar shape that turns a floating [low, high] bar into a candlestick:
// a thin high-low wick plus a coloured open-close body, coloured by direction.
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
  const scale = height / (high - low || 1); // px per price unit
  const openY = y + (high - open) * scale;
  const closeY = y + (high - close) * scale;
  const bodyTop = Math.min(openY, closeY);
  const bodyH = Math.max(Math.abs(closeY - openY), 1.5);
  const cx = x + width / 2;
  const bw = Math.max(Math.min(width * 0.62, 9), 2);
  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1.1} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} rx={1.2} fill={color} />
    </g>
  );
}

// The glass themes tuck the chart behind the content box during the goo
// merge/split (~1.3s), so the draw-in is delayed to line up with the reveal. The
// other themes (bw / blue / green) have no merge — the charts are visible right
// away — so they draw in almost immediately.
function drawInDelay() {
  if (typeof document === "undefined") return 1300;
  const theme = document.documentElement.getAttribute("data-theme") ?? "";
  return theme.includes("glass") ? 1300 : 150;
}

export default function Chart({ type, seed = 7 }: { type: ChartType; seed?: number }) {
  const gradId = useId();
  const begin = useMemo(() => drawInDelay(), []);

  const candles = useMemo(() => makeCandles(seed), [seed]);
  const line = useMemo(() => makeLine(seed), [seed]);
  const bars = useMemo(() => makeBars(seed), [seed]);

  if (type === "candlestick") {
    const lo = Math.min(...candles.map((d) => d.low));
    const hi = Math.max(...candles.map((d) => d.high));
    const pad = (hi - lo) * 0.08;
    return (
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%" debounce={220}>
          <ComposedChart data={candles} margin={{ top: 10, right: 8, bottom: 2, left: 2 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} domain={[lo - pad, hi + pad]} tickFormatter={(v) => Math.round(v).toString()} />
            <Bar
              dataKey="range"
              shape={<CandleShape />}
              isAnimationActive
              animationBegin={begin}
              animationDuration={750}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "line") {
    return (
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%" debounce={220}>
          <AreaChart data={line} margin={{ top: 10, right: 8, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity={0.3} />
                <stop offset="100%" stopColor={LINE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={(v) => Math.round(Number(v)).toString()} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={LINE}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              isAnimationActive
              animationBegin={begin}
              animationDuration={950}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%" debounce={220}>
        <BarChart data={bars} margin={{ top: 10, right: 8, bottom: 2, left: 2 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} domain={[0, "dataMax + 10"]} />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationBegin={begin}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {bars.map((_, i) => (
              <Cell key={i} fill={BAR} fillOpacity={0.5 + (i / bars.length) * 0.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
