import { useLayoutEffect, useRef, useState } from "react";
import NavItem from "./NavItem";
import Profile from "./Profile";
import { icons } from "../icons";
import "./Sidebar.css";

const workspaceItems = [
  { icon: icons.home, label: "Home", w: 12, h: 12 },
  { icon: icons.chats, label: "Chats", w: 13, h: 11 },
  { icon: icons.projects, label: "Projects", w: 12, h: 10 },
  { icon: icons.watchlist, label: "Watchlist", w: 14, h: 12 },
  { icon: icons.workflows, label: "Workflows", w: 15, h: 10 },
];

const recentItems = [
  { icon: icons.workbench, label: "Workbench", w: 11, h: 11 },
  { icon: icons.backtests, label: "My Backtests", w: 12, h: 10 },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  activePage?: string;
  onNavigate?: (page: string) => void;
  theme: string;
  onThemeChange: (
    theme: "bw" | "blue" | "green" | "glass" | "liquid-glass",
  ) => void;
}

export default function Sidebar({
  collapsed,
  onToggle,
  activePage = "Home",
  onNavigate,
  theme,
  onThemeChange,
}: SidebarProps) {
  // Liquid-glass menu: a single glass "blob" indicator slides between nav items,
  // stretching/jiggling as it travels to the clicked one.
  const navRef = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [moving, setMoving] = useState(false);
  const firstRun = useRef(true);
  const prevActive = useRef(activePage);
  const useBlob = theme === "liquid-glass" || theme === "glass";

  // Cursor-reactive tilt + translate + stretch while hovering the blob.
  const blobElRef = useRef<HTMLDivElement>(null);
  const tiltRaf = useRef(0);
  const tiltNext = useRef("");
  const resetTilt = () => {
    if (tiltRaf.current) {
      cancelAnimationFrame(tiltRaf.current);
      tiltRaf.current = 0;
    }
    if (blobElRef.current) {
      blobElRef.current.style.transform = "";
      blobElRef.current.style.setProperty("--blob-glare", "0");
    }
  };
  const onNavMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!useBlob || !blob) return;
    const nav = navRef.current;
    if (!nav) return;
    const nr = nav.getBoundingClientRect();
    const cx = e.clientX - nr.left;
    const cy = e.clientY - nr.top;
    const bx = blob.x + blob.w / 2;
    const by = blob.y + blob.h / 2;
    const hw = blob.w / 2;
    const hh = blob.h / 2;
    if (Math.abs(cx - bx) > hw + 8 || Math.abs(cy - by) > hh + 8) {
      resetTilt();
      return;
    }
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    const nx = clamp((cx - bx) / hw);
    const ny = clamp((cy - by) / hh);
    // Edge glare: a subtle rim highlight pushed to the blob edge on the side
    // facing the cursor (like the WebGL glass rim light). Intensity is full over
    // the blob and fades across the 8px proximity margin.
    const bl = blobElRef.current;
    if (bl) {
      const margin = Math.max(
        Math.max(0, Math.abs(cx - bx) - hw),
        Math.max(0, Math.abs(cy - by) - hh),
      );
      // angle of the edge facing the cursor (CSS gradient: 0deg=up, 90deg=right)
      const angle = (Math.atan2(nx, -ny) * 180) / Math.PI;
      bl.style.setProperty("--blob-angle", `${angle.toFixed(1)}deg`);
      bl.style.setProperty("--blob-glare", Math.max(0, 1 - margin / 8).toFixed(2));
    }
    // subtle tilt + translate + a small stretch toward the cursor
    tiltNext.current =
      `perspective(360px) rotateX(${(-ny * 7).toFixed(2)}deg) rotateY(${(nx * 7).toFixed(2)}deg)` +
      ` translate3d(${(nx * 2).toFixed(2)}px, ${(ny * 2).toFixed(2)}px, 0)` +
      ` scale(${(1 + Math.abs(nx) * 0.03).toFixed(3)}, ${(1 + Math.abs(ny) * 0.03).toFixed(3)})`;
    if (!tiltRaf.current) {
      tiltRaf.current = requestAnimationFrame(() => {
        tiltRaf.current = 0;
        if (blobElRef.current) blobElRef.current.style.transform = tiltNext.current;
      });
    }
  };

  useLayoutEffect(() => {
    if (!useBlob) return;
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>(".nav-item--active");
    if (!nav || !el) return;
    const nr = nav.getBoundingClientRect();
    const ar = el.getBoundingClientRect();
    setBlob({ x: ar.left - nr.left, y: ar.top - nr.top, w: ar.width, h: ar.height });

    const changed = prevActive.current !== activePage;
    prevActive.current = activePage;
    if (changed && !firstRun.current) {
      setMoving(true);
      const t = window.setTimeout(() => setMoving(false), 620);
      return () => clearTimeout(t);
    }
    firstRun.current = false;
  }, [activePage, collapsed, useBlob]);

  return (
    <aside
      className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}
      aria-hidden={collapsed}
    >
      <header className="sidebar__header">
        <div className="sidebar__brand">
          <button
            type="button"
            className="sidebar__logo-btn"
            aria-label={collapsed ? "Expand menu" : "Toggle menu"}
            onClick={onToggle}
          >
            <img
              className="sidebar__logo"
              src={icons.flashLogo}
              width={30}
              height={30}
              alt="Flash"
            />
            <img
              className="sidebar__logo-toggle"
              src={icons.sidebarToggle}
              width={18}
              height={18}
              alt=""
            />
          </button>
          <span className="sidebar__wordmark">Flash</span>
        </div>
        <button
          type="button"
          className="sidebar__toggle"
          aria-label="Collapse sidebar"
          onClick={onToggle}
        >
          <img src={icons.sidebarToggle} width={16} height={16} alt="" />
        </button>
      </header>

      <div
        className="sidebar__nav"
        ref={navRef}
        onMouseMove={onNavMove}
        onMouseLeave={resetTilt}
      >
        {useBlob && blob && (
          <div
            ref={blobElRef}
            className={`nav-blob${moving ? " nav-blob--moving" : ""}`}
            style={{
              translate: `${blob.x}px ${blob.y}px`,
              width: blob.w,
              height: blob.h,
            }}
            aria-hidden
          />
        )}

        <nav className="sidebar__section sidebar__section--workspace">
          <p className="sidebar__label">Workspace</p>
          <div className="sidebar__list">
            {workspaceItems.map((item) => (
              <NavItem
                key={item.label}
                {...item}
                active={activePage === item.label}
                onClick={() => onNavigate?.(item.label)}
              />
            ))}
          </div>
        </nav>

        <div className="sidebar__divider" />

        <nav className="sidebar__section sidebar__section--recents">
          <p className="sidebar__label">Recents</p>
          <div className="sidebar__list">
            {recentItems.map((item) => (
              <NavItem
                key={item.label}
                {...item}
                active={activePage === item.label}
                onClick={() => onNavigate?.(item.label)}
              />
            ))}
          </div>
        </nav>
      </div>

      <Profile theme={theme} onThemeChange={onThemeChange} />
    </aside>
  );
}
