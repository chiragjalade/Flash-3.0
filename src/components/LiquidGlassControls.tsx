import { Fragment, useState } from "react";
import {
  LIQUID_GLASS_PARAMS,
  LIQUID_GLASS_DEFAULTS,
  type LConfig,
} from "../glassParams";
import "./LiquidGlassControls.css";

interface Props {
  config: LConfig;
  onChange: (config: LConfig) => void;
}

// Dedicated bottom-right parameter panel for the Liquid Glass Pro theme —
// mirrors the reference project's control panel (grouped sections).
export default function LiquidGlassControls({ config, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const set = (key: string, value: number | boolean | string) =>
    onChange({ ...config, [key]: value });

  const fmt = (v: number, step: number) =>
    step < 1 ? v.toFixed(2) : String(Math.round(v));

  let currentSection = "";

  return (
    <div className={`lgctl${open ? " lgctl--open" : ""}`}>
      <button
        type="button"
        className="lgctl__head"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Liquid Glass Pro — Parameters</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path
            d={open ? "M3 7.5 6 4.5 9 7.5" : "M3 4.5 6 7.5 9 4.5"}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="lgctl__body">
          {/* Live blob-merge preview (gooey #lg-blob filter, driven by Merge Rate) */}
          <div className="lgctl__preview">
            <span className="lgctl__preview-label">Blob merge</span>
            <div className="lgctl__blob" aria-hidden>
              <span className="lgctl__blob-dot lgctl__blob-dot--a" />
              <span className="lgctl__blob-dot lgctl__blob-dot--b" />
              {config.show2nd !== false && (
                <span className="lgctl__blob-dot lgctl__blob-dot--c" />
              )}
            </div>
          </div>

          {LIQUID_GLASS_PARAMS.map((p) => {
            const showHeader = p.section !== currentSection;
            currentSection = p.section;
            const num = Number(config[p.key] ?? 0);

            return (
              <Fragment key={p.key}>
                {showHeader && (
                  <p className="lgctl__section">{p.section}</p>
                )}

                {p.type === "boolean" ? (
                  <label className="lgctl__row lgctl__row--check">
                    <span className="lgctl__label">{p.label}</span>
                    <input
                      type="checkbox"
                      className="lgctl__check"
                      checked={Boolean(config[p.key])}
                      onChange={(e) => set(p.key, e.target.checked)}
                    />
                  </label>
                ) : p.type === "color" ? (
                  <label className="lgctl__row lgctl__row--color">
                    <span className="lgctl__label">{p.label}</span>
                    <input
                      type="color"
                      className="lgctl__color"
                      // <input type=color> can't hold alpha; edit the RGB, keep alpha
                      value={String(config[p.key] ?? "#ffffff00").slice(0, 7)}
                      onChange={(e) =>
                        set(
                          p.key,
                          e.target.value +
                            String(config[p.key] ?? "#ffffff00").slice(7, 9),
                        )
                      }
                    />
                    <span className="lgctl__value lgctl__value--hex">
                      {String(config[p.key] ?? "#ffffff00")}
                    </span>
                  </label>
                ) : (
                  <label className="lgctl__row">
                    <span className="lgctl__label">{p.label}</span>
                    <input
                      className="lgctl__slider"
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={num}
                      onChange={(e) => set(p.key, Number(e.target.value))}
                    />
                    <span className="lgctl__value">
                      {fmt(num, p.step ?? 1)}
                    </span>
                  </label>
                )}
              </Fragment>
            );
          })}

          <button
            type="button"
            className="lgctl__reset"
            onClick={() => onChange({ ...LIQUID_GLASS_DEFAULTS })}
          >
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
