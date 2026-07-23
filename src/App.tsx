import { useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import WatchlistPage from "./components/WatchlistPage";
import GlassControls from "./components/GlassControls";
import LiquidGlassControls from "./components/LiquidGlassControls";
import GlassLayer from "./components/GlassLayer";
import ClockWidget from "./components/ClockWidget";
import {
  GLASS_DEFAULTS,
  LIQUID_GLASS_DEFAULTS,
  type GlassConfig,
  type LConfig,
} from "./glassParams";
import "./App.css";

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState("Home");
  // Persist the theme so a refresh reopens in the same theme (and the clock's
  // liquid-glass emerge can replay on load).
  const [theme, setTheme] = useState(
    () => localStorage.getItem("flash-theme") || "liquid-glass",
  );
  const [glassConfig, setGlassConfig] = useState<GlassConfig>({
    ...GLASS_DEFAULTS,
  });
  const [liquidConfig, setLiquidConfig] = useState<LConfig>({
    ...LIQUID_GLASS_DEFAULTS,
  });
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  // Dispersion maps for the Liquid Glass Pro theme (per-channel refraction).
  const dispRefR = useRef<SVGFEDisplacementMapElement>(null);
  const dispRefG = useRef<SVGFEDisplacementMapElement>(null);
  const dispRefB = useRef<SVGFEDisplacementMapElement>(null);
  const blobRef = useRef<SVGFEGaussianBlurElement>(null); // gooey blob strength
  const toggle = () => setCollapsed((v) => !v);

  // Both glass themes share the reflection/glare pointer system.
  const isGlass = theme === "glass" || theme === "liquid-glass";

  // Apply theme to <html> (drives all CSS variables) + persist it.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("flash-theme", theme);
  }, [theme]);

  // Glass theme: map its params to the shared --g-* variables + displacement.
  useEffect(() => {
    if (theme !== "glass") return;
    const g = (k: string) => glassConfig[k] ?? 0;
    const s = document.documentElement.style;
    s.setProperty("--g-blur", `${(g("blurAmount") * 16).toFixed(2)}px`);
    s.setProperty("--g-saturate", `${1 + g("saturation")}`);
    s.setProperty("--g-brightness", `${1 + g("brightness")}`);
    s.setProperty("--g-opacity", `${g("opacity")}`);
    s.setProperty("--g-edge", `${g("edgeHighlight")}`);
    s.setProperty("--g-specular", `${g("specular")}`);
    s.setProperty("--g-fresnel", `${(0.25 + g("fresnel") * 0.4).toFixed(3)}`);
    s.setProperty("--g-zradius", `${g("zRadius")}px`);
    s.setProperty("--g-tint", `${g("tintStrength")}`);
    s.setProperty("--g-radius", `${g("cornerRadius")}px`);
    s.setProperty("--g-chrom", `${g("chromAberration")}`);
    s.setProperty("--g-shadow", `${g("shadowOpacity")}`);
    s.setProperty("--g-shadow-spread", `${g("shadowSpread")}px`);
    s.setProperty("--g-shadow-y", `${g("shadowOffsetY")}px`);
    dispRef.current?.setAttribute(
      "scale",
      `${((g("refraction") + g("distortion")) * 55).toFixed(1)}`,
    );
  }, [glassConfig, theme]);

  // Liquid Glass Pro: the full reference param set → shared --g-* vars, Pro-only
  // --lg-* vars, per-channel dispersion scales, and the gooey blob strength.
  useEffect(() => {
    if (theme !== "liquid-glass") return;
    const c = liquidConfig;
    const n = (k: string) => Number(c[k] ?? 0);
    const b = (k: string) => Boolean(c[k]);
    const s = document.documentElement.style;

    // Gaussian blur (Blur Radius) + Blur Edge softens the rim (anti-alias)
    s.setProperty("--g-blur", `${n("blurRadius").toFixed(2)}px`);
    s.setProperty("--lg-aa", b("blurEdge") ? "1.2px" : "0px");

    // Refraction (Thickness × Refraction Factor) + chromatic dispersion (Gain)
    const base = n("refractionFactor") * (0.5 + n("thickness") / 40) * 14;
    const spread = 1 + n("dispersionGain") * 0.03;
    dispRefR.current?.setAttribute("scale", `${(base * spread).toFixed(1)}`);
    dispRefG.current?.setAttribute("scale", `${base.toFixed(1)}`);
    dispRefB.current?.setAttribute("scale", `${(base / spread).toFixed(1)}`);

    // Fresnel: size → rim width, intensity → brightness
    s.setProperty(
      "--g-fresnel",
      `${(0.12 + (n("fresnelIntensity") / 100) * 0.7).toFixed(3)}`,
    );
    s.setProperty(
      "--g-edge",
      `${(0.25 + (n("fresnelIntensity") / 100) * 0.5).toFixed(3)}`,
    );
    s.setProperty("--lg-fresnel-w", `${(0.6 + n("fresnelSize") * 0.03).toFixed(2)}px`);

    // Glare: intensity / size / angle; hardness+convergence tighten the sheen band
    s.setProperty("--lg-glare-i", `${(n("glareIntensity") / 100).toFixed(3)}`);
    s.setProperty("--lg-glare-angle", `${n("glareAngle")}deg`);
    s.setProperty("--lg-glare-size", `${(30 + n("glareSize") * 1.6).toFixed(0)}px`);
    s.setProperty(
      "--lg-glare-band",
      `${(4 + (n("glareHardness") + n("glareConvergence")) * 0.05).toFixed(1)}%`,
    );
    s.setProperty(
      "--g-specular",
      `${(0.2 + (n("glareIntensity") / 100) * 0.4).toFixed(3)}`,
    );

    // Tint (RGBA hex string, e.g. #ffffff00 → transparent)
    s.setProperty("--lg-tint", String(c.tint ?? "#ffffff00"));

    // Shadow
    s.setProperty("--g-shadow", `${(n("shadowIntensity") / 100).toFixed(3)}`);
    s.setProperty("--g-shadow-spread", `${(n("shadowExpand") * 0.7).toFixed(1)}px`);
    s.setProperty("--g-shadow-x", `${n("shadowX")}px`);
    s.setProperty("--g-shadow-y", `${n("shadowY")}px`);

    // Superellipse / radius → component corner radius; fixed frost fill
    s.setProperty(
      "--g-radius",
      `${Math.min(30, n("radiusPct") * 0.22 + n("superEllipse")).toFixed(1)}px`,
    );
    s.setProperty("--g-saturate", "1.6");
    s.setProperty("--g-opacity", "0.14");

    // Blob-merge preview shape params (consumed by LiquidGlassControls.css)
    s.setProperty("--lg-shape-w", `${(14 + n("width") / 12).toFixed(1)}px`);
    s.setProperty("--lg-shape-h", `${(14 + n("height") / 12).toFixed(1)}px`);
    s.setProperty("--lg-shape-radius", `${(n("radiusPct") / 2).toFixed(1)}%`);
    s.setProperty("--lg-morph", `${(3 - n("animMorph") * 0.12).toFixed(2)}s`);
    // Blob merge strength (gooey blur radius) from Merge Rate. Kept modest so a
    // high merge rate fuses the shapes instead of over-blurring them away.
    blobRef.current?.setAttribute(
      "stdDeviation",
      `${(1.5 + n("mergeRate") * 7).toFixed(1)}`,
    );
  }, [liquidConfig, theme]);

  // Apple-style edge reflection: as the cursor moves over a glass component,
  // translate that component's rim highlight in the OPPOSITE direction — subtle,
  // smoothed by the CSS transition on --g-rx/--g-ry. Only the component under the
  // cursor reacts; it eases back to rest when the cursor leaves.
  useEffect(() => {
    if (!isGlass) return;
    const SELECTOR =
      ".prompt, .rdesk-card, .rdesk__spot-card, .wl-results, .wl-followed__card," +
      ".wl-searchbox, .theme-pop, .prompt__attach, .prompt__chip, .chat__pull," +
      ".wl-filter, .rdesk__filter, .prompt__send, .clock-widget__card, .lg-blob";
    const MAX = 5; // px — max rim shift; keep small for subtlety
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

    let active: HTMLElement | null = null;
    let raf = 0;
    let lastX = 0;
    let lastY = 0;

    const reset = (el: HTMLElement) => {
      el.style.setProperty("--g-rx", "0px");
      el.style.setProperty("--g-ry", "0px");
      el.style.setProperty("--g-glare", "0"); // fade the glare out on leave
    };

    const apply = () => {
      raf = 0;
      if (!active) return;
      const r = active.getBoundingClientRect();
      const nx = clamp((lastX - (r.left + r.width / 2)) / (r.width / 2));
      const ny = clamp((lastY - (r.top + r.height / 2)) / (r.height / 2));
      active.style.setProperty("--g-rx", `${(-nx * MAX).toFixed(2)}px`);
      active.style.setProperty("--g-ry", `${(-ny * MAX).toFixed(2)}px`);
      // Liquid Glass Pro glare: cursor position as % + glare on (harmless in the
      // plain glass theme, which doesn't read these vars).
      active.style.setProperty(
        "--g-gx",
        `${(clamp01((lastX - r.left) / r.width) * 100).toFixed(1)}%`,
      );
      active.style.setProperty(
        "--g-gy",
        `${(clamp01((lastY - r.top) / r.height) * 100).toFixed(1)}%`,
      );
      active.style.setProperty("--g-glare", "1");
    };

    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(
        SELECTOR,
      ) as HTMLElement | null;
      if (active && active !== el) {
        reset(active);
        active = null;
      }
      if (!el) return;
      active = el;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      if (active) reset(active);
    };
  }, [isGlass]);

  return (
    <div className={`app${collapsed ? " app--collapsed" : ""}`}>
      {/* SVG displacement map driving the components' liquid-glass refraction */}
      <svg className="glass-defs" aria-hidden focusable="false">
        <filter id="liquid-glass" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.012"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.2" result="softNoise" />
          <feDisplacementMap
            ref={dispRef}
            in="SourceGraphic"
            in2="softNoise"
            scale={42}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Liquid Glass Pro: refraction + chromatic DISPERSION. Displaces the
            backdrop three times at slightly different scales, isolates the R/G/B
            channel from each, then adds them back — so colours split at the
            refracted edges (N_R < N_G < N_B, as in the reference shader). */}
        <filter
          id="lg-glass"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.009"
            numOctaves={2}
            seed={12}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.6" result="softNoise" />
          <feDisplacementMap
            ref={dispRefR}
            in="SourceGraphic"
            in2="softNoise"
            scale={64}
            xChannelSelector="R"
            yChannelSelector="G"
            result="dR"
          />
          <feDisplacementMap
            ref={dispRefG}
            in="SourceGraphic"
            in2="softNoise"
            scale={56}
            xChannelSelector="R"
            yChannelSelector="G"
            result="dG"
          />
          <feDisplacementMap
            ref={dispRefB}
            in="SourceGraphic"
            in2="softNoise"
            scale={48}
            xChannelSelector="R"
            yChannelSelector="G"
            result="dB"
          />
          <feColorMatrix
            in="dR"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="cR"
          />
          <feColorMatrix
            in="dG"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="cG"
          />
          <feColorMatrix
            in="dB"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="cB"
          />
          <feComposite
            in="cR"
            in2="cG"
            operator="arithmetic"
            k1={0}
            k2={1}
            k3={1}
            k4={0}
            result="cRG"
          />
          <feComposite
            in="cRG"
            in2="cB"
            operator="arithmetic"
            k1={0}
            k2={1}
            k3={1}
            k4={0}
          />
        </filter>

        {/* Liquid Glass Pro: gooey "blob" metaball filter. Blur spreads the
            shapes' alpha, the alpha-contrast matrix re-sharpens it into merged
            blobs, then the original is composited on top. Strength = blur radius
            (driven by the Blob Merge slider). */}
        <filter id="lg-blob">
          <feGaussianBlur
            ref={blobRef}
            in="SourceGraphic"
            stdDeviation="5"
            result="blur"
          />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>

        {/* Gentle refraction + chromatic dispersion for the sliding menu blob —
            distorts the icon/label showing through the glass (small scale so text
            stays readable). */}
        <filter
          id="menu-glass"
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.014 0.02"
            numOctaves={2}
            seed={4}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale={9} xChannelSelector="R" yChannelSelector="G" result="dR" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale={6} xChannelSelector="R" yChannelSelector="G" result="dG" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale={3} xChannelSelector="R" yChannelSelector="G" result="dB" />
          <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cR" />
          <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cG" />
          <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cB" />
          <feComposite in="cR" in2="cG" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} result="cRG" />
          <feComposite in="cRG" in2="cB" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
        </filter>
      </svg>

      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        activePage={page}
        onNavigate={setPage}
        theme={theme}
        onThemeChange={setTheme}
      />
      {page === "Watchlist" ? <WatchlistPage /> : <ChatPanel />}

      <ClockWidget theme={theme} />

      {theme === "glass" && (
        <GlassControls config={glassConfig} onChange={setGlassConfig} />
      )}

      {theme === "liquid-glass" && (
        <LiquidGlassControls config={liquidConfig} onChange={setLiquidConfig} />
      )}

      {/* WebGL glass: every glass surface merges (drag the clock over cards) */}
      {theme === "liquid-glass" && <GlassLayer config={liquidConfig} />}
    </div>
  );
}
