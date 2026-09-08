import { useRef, useState } from "react";
import AbstractLines from "./components/AbstractLines";
import EdgeMotifs from "./components/EdgeMotifs";
import Features from "./components/Features";
import Hero from "./components/Hero";
import Nav from "./components/Nav";
import Problem from "./components/Problem";

// The old app shell (sidebar, chat, watchlist, clock, palette, both glass themes)
// is still on disk and untouched — only this entry point changed, so
// `git checkout src/App.tsx` brings the whole thing back.
//
// The menu's open state lives here rather than inside Nav because both pages react
// to it: the lockup, caption, the edge motifs and the clock all recess while the
// dropdown is down. Explicit props keep that relationship visible.
//
// Nav renders last so its panel and scrim paint over the page without depending on
// z-index alone.
export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Scroll-driven material blend for the edge motifs: Problem writes it every
  // frame, EdgeMotifs reads it every frame. A ref rather than state because it
  // changes continuously — as state it would re-render the whole tree per frame.
  const toneRef = useRef(0);
  // Same shape, same reason: the ornaments change metal with the second clock, and
  // that is written by Problem every frame too.
  const alloyRef = useRef(0);
  return (
    <>
      {/* Fixed to the viewport, so the pages scroll past a single pair rather than
          each carrying its own copy. */}
      <EdgeMotifs recessed={menuOpen} toneRef={toneRef} alloyRef={alloyRef} />
      {/* Also fixed, and painted after the ornaments so it sits over them where the
          two overlap — the order frame 1722:3 puts them in. */}
      <AbstractLines />
      <Hero recessed={menuOpen} />
      <Problem recessed={menuOpen} toneRef={toneRef} alloyRef={alloyRef} />
      <Features />
      <Nav open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
