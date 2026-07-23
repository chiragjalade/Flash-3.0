import { useState } from "react";
import { GLASS_PARAMS, GLASS_DEFAULTS, type GlassConfig } from "../glassParams";
import "./GlassControls.css";

interface GlassControlsProps {
  config: GlassConfig;
  onChange: (config: GlassConfig) => void;
}

export default function GlassControls({ config, onChange }: GlassControlsProps) {
  const [open, setOpen] = useState(true);

  const set = (key: string, value: number) =>
    onChange({ ...config, [key]: value });

  return (
    <div className={`glassctl${open ? " glassctl--open" : ""}`}>
      <button
        type="button"
        className="glassctl__head"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Liquid Glass — Parameters</span>
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
        <div className="glassctl__body">
          {GLASS_PARAMS.map((p) => (
            <label className="glassctl__row" key={p.key}>
              <span className="glassctl__label">{p.label}</span>
              <input
                className="glassctl__slider"
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={config[p.key] ?? 0}
                onChange={(e) => set(p.key, Number(e.target.value))}
              />
              <span className="glassctl__value">
                {(config[p.key] ?? 0).toFixed(p.step < 1 ? 2 : 0)}
              </span>
            </label>
          ))}

          <button
            type="button"
            className="glassctl__reset"
            onClick={() => onChange({ ...GLASS_DEFAULTS })}
          >
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
