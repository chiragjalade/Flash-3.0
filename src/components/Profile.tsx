import { useEffect, useRef, useState } from "react";
import { icons } from "../icons";
import "./Profile.css";

type Theme = "bw" | "blue" | "green" | "glass" | "liquid-glass";

const THEMES: { id: Theme; label: string }[] = [
  { id: "bw", label: "B / W" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "glass", label: "Liquid Glass" },
  { id: "liquid-glass", label: "Liquid Glass Pro" },
];

interface ProfileProps {
  theme: string;
  onThemeChange: (theme: Theme) => void;
}

export default function Profile({ theme, onThemeChange }: ProfileProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the popup on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="profile" ref={ref}>
      <img
        className="profile__avatar"
        src={icons.profileAvatar}
        width={30}
        height={30}
        alt=""
      />
      <div className="profile__info">
        <span className="profile__name">Chirag S Jalade</span>
        <span className="profile__email">chirag@quanthive.in</span>
      </div>
      <button
        type="button"
        className="profile__menu"
        aria-label="Profile options"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <img src={icons.profileMenu} width={3} height={13} alt="" />
      </button>

      {open && (
        <div className="theme-pop" role="menu">
          <p className="theme-pop__title">Theme</p>
          <div className="theme-pop__list">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={theme === t.id}
                className={`theme-opt${theme === t.id ? " theme-opt--active" : ""}`}
                onClick={() => {
                  onThemeChange(t.id);
                  setOpen(false);
                }}
              >
                <span className="theme-opt__dot" data-swatch={t.id} />
                <span className="theme-opt__label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
