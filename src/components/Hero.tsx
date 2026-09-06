import MetalSurface from "./MetalSurface";
import { STAINLESS } from "../shaders/liquidMetal";
import "./Hero.css";

const LOCKUP_SRC = "/icons/quanthive-lockup.svg";

// The lockup SVG carries transparent padding around its artwork, which the mask
// pipeline needs (see the file's own comment). `artHeightShare` converts a bevel
// fraction defined against the ARTWORK into one against the padded box.
const LOCKUP_ART_SHARE = 2365.401 / 2665.401;

export default function Hero({ recessed = false }: { recessed?: boolean }) {
  return (
    <main className="hero" data-recessed={recessed || undefined}>
      <div className="hero__grid" aria-hidden />

      <div className="hero__inner">
        <MetalSurface
          className="hero__lockup"
          src={LOCKUP_SRC}
          artHeightShare={LOCKUP_ART_SHARE}
          bevelFrac={STAINLESS.bevelFrac}
        >
          {/* Accessible name for the mark, which is otherwise pixels in a canvas. */}
          <h1 className="hero__sr">QuantHive</h1>
        </MetalSurface>
        <p className="hero__sub">Investment intelligence</p>
      </div>
    </main>
  );
}
