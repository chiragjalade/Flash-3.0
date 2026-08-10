# Liquid Glass — the docked prompt pill

Frontend reference for the lens effect on the chat playground's docked prompt box
in the **Liquid Glass Pro** theme (`data-theme="liquid-glass"`).

Covers: edge refraction, rim chromatic dispersion (RGB split), text stretch, and
the edge roll-off.

**Files**

| File | Role |
| --- | --- |
| `src/components/PillGlass.tsx` | Generates the displacement maps and both SVG filters |
| `src/styles/liquid-glass.css` | Applies the filters; frost/fill state gating; text colour |
| `src/styles/glass.css` | Shared glass surface for all `*glass*` themes |
| `src/components/ChatPanel.css` | Pill layout — padding, radius, `max-height` |

---

## 1. Why this exists at all

The theme already has a full WebGL glass shader in `GlassLayer.tsx`, and it
implements this exact effect — edge-confined refraction (`ef`), rim dispersion
(`dispA = u_disp * ef * ef`), fresnel, glare. **It cannot be used here.**

Two reasons, both structural:

1. It samples only the **background photo** (`u_bg`). It has no access to the DOM
   message bubbles that scroll behind the pill.
2. Its canvas is `z-index: -1`, beneath all DOM content.

That is why `SELECTOR` in `GlassLayer.tsx` explicitly excludes `.prompt--dock`.
Don't "fix" that exclusion — it is deliberate.

`backdrop-filter` *can* see the DOM behind an element, but CSS has no lens
primitive. So we hand it an SVG filter whose displacement map is generated
per-size on a `<canvas>`.

### Browser support

`url()` inside `backdrop-filter` works in **Chrome and Safari**. **Firefox ignores
it entirely** and falls back to the plain frost already on the pill. `feImage`
with a data-URI does execute inside `backdrop-filter` in Chrome — this was the
main unknown when the feature was built, and it is confirmed working.

---

## 2. Architecture

Two filters, because two different things get refracted.

```
#pill-glass        backdrop-filter   bends what is BEHIND the pill, at the rim
#pill-glass-text   filter            bends the pill's OWN text, incl. edge roll-off
```

Two generated maps feed them:

| Map | Function | Channels |
| --- | --- | --- |
| bevel | `bevelMap()` | R,G = outward normal × edge factor |
| text | `textShoulderMap()` | R,G = stretch field **+ edge roll-off** · **B = dispersion-zone weight** |

`feDisplacementMap` reads only R and G, which leaves B free to carry a mask —
that is what makes the dispersion zoneable (§6).

> **The roll-off is not a separate layer.** It used to be: displace, blur twice,
> mask, fade to 55%, composite over the body. Laying a semi-opaque sheet over part
> of the glass is exactly what made that band read as a separate pane sitting on
> the surface rather than as the surface itself. It is now summed into the same
> displacement channels as the shoulder, so it has no opacity of its own — the
> text simply *is* stretched there, on the one glass layer.
>
> Merging it deleted two maps (`reflectionMap`, `capWeightMap`), two `feImage`s,
> two `feGaussianBlur`s and four composites. It also gave up two things that only
> a separate layer can do: **per-region blur** and **partial opacity**. If the
> band ever needs softening again, that is the trade being reopened.

### The text filter graph

```
SourceGraphic ─┬─ displace by mS (single pass) ─────────────── bodyPlain
               └─ displace by mS (×3, dispersive) ── mask by mS.B ─┐
                                                          bodyPlain┴─ over → out
```

---

## 3. The core idea: displacement ≠ distortion

**This is the single most important thing to understand before touching any
number in this file.**

A displacement map moves pixels. A *uniform* displacement translates content; only
the **gradient** of the displacement stretches it. A field can be large somewhere
and still do visually nothing there.

This cost several iterations. A centre-normalised radial barrel field put ~4.8px
of displacement on the text but varied only **2% per glyph** — it slid the word
sideways as a rigid block and looked like the effect was broken.

```
                        shift at x=18   gradient/glyph
radial barrel (bad)         4.84px         0.15px (2%)   ← invisible
lens shoulder (used)       −9.54px         1.13px (14%)
```

Corollary: you cannot buy more stretch by raising the amplitude, because gradient
and translation scale together — 10× the stretch means the text leaves the pill.
You buy it by making the **limb shorter**: gradient ≈ peak ÷ limb-length.

---

## 4. Field shapes

### 4.1 Bevel (backdrop) — `bevelMap()`

Signed distance to the rounded rect → edge factor `t = clamp(1 + d/bevel)`,
smoothstepped, displaced along the outward normal. Zero across the flat interior,
maximum at the rim. Mirrors `ef` in the WebGL shader.

### 4.2 Text shoulder — `textShoulderMap()`

Two **lens shoulders** — `smoothstep(0,p,d) · (1 − smoothstep(p,l,d))` — one keyed
on horizontal distance from the caps, one on vertical distance from the top/bottom
edges.

- The horizontal one stretches the start and end of a line.
- The vertical one is what makes a **single line** visible at all: at 46px tall
  the glyphs sit only ~16px from both edges.
- Zone size is keyed on the **corner radius**, not the height. Keying it on height
  gave a 1-line box a 62px zone and a 5-line box a 170px one, so the effect only
  appeared once the box was tall.

### 4.3 Edge roll-off — inside `textShoulderMap()`

**Not a mirror, and not its own layer.** Summed into the same displacement
channels as the shoulder:

```
depth(dn) = rOut − (rOut − dn) · k          k ∈ (0, 1)

slope        = k > 0        → reading order preserved, never inverted
stretch      = 1/k          → smaller k toward the caps = more stretch there
depth(rOut)  = rOut         → continuous with the real text it abuts
```

A *negative* slope is what produces a mirror; an earlier version used a sine fold
precisely to drive `1 + A·2π/(b−a)·cos θ` below zero. Positive slope means the text
compresses as it approaches the rim — bending away over the glass edge rather than
reflecting in it.

**`k` is also the source span.** The band consumes `(rOut − rIn) · k` of content,
which is what keeps it to the ~2px sliver at the very edge instead of echoing
glyphs that are nowhere near being cut. It also decouples the two knobs: widen
`(rOut − rIn)` and drop `k` by the same factor and the band gets broader while the
echoed sliver is unchanged.

The window fades the **displacement**, not alpha — at both ends of the band content
settles back to its own depth. At the inner end that is continuity with the real
text; at the outer end it is the empty border region, so the streaks thin out on
their own.

#### What it cannot do

The band shows the **topmost still-visible text**, not the text that scrolled away.
The textarea's `overflow` clip is applied *before* the filter runs, so clipped
content is not in `SourceGraphic` at all. A non-inverted band therefore has exactly
two options — sample shallower than the clip (blank) or deeper (an echo of visible
text). There is no third case, and no amount of tuning produces one.

Showing genuinely departed text needs a **second DOM layer**: a hidden `<div>`
mirroring the textarea's value and scroll position, not clipped at the same place.
That is the only route to it.

#### Known trade-off: the band is contour-shaped, the text is straight

`dn` is distance to the **contour**, so the band is an inset rounded rect while a
line of text is dead straight. Toward the caps the contour curves inward, so at the
text's own `y` the depth shrinks and those pixels sit deeper in the band. Measured
alpha at the text's top edge back when the band was a visible layer: `55%` at
`x=8`, `11.5%` from `x=26` on — it hugged the text near the corners and pulled away
toward the centre.

Profiling on **vertical** distance while keeping the SDF purely as a clip fixes it,
and measured flat across the width. It was implemented and then **reverted at the
author's request**; the change is confined to the roll-off block:

```
profile depth   dn (SDF)          →  dv = min(py − pad, pad + h − py)
direction       surface normal    →  vertical, sign by half
SDF role        profile + clip    →  clip only, via smoothstep(0, 3, dn)
```

Note the distinction from §5.3, which is what makes this easy to get wrong: the
SDF is mandatory for **clipping** (a box-keyed band chews up the corners), but that
is not the same as using it for **profiling**.

---

## 5. Invariants — break these and it visibly breaks

Each of these was a real bug. Keep them.

### 5.1 Maps must be padded and neutral in the margin

Filter regions extend past the element (the rim pulls in outside content; the drop
shadow must not clip). **Wherever `in2` is undefined, `feDisplacementMap` reads
transparent black — `R=G=0` — which is not "no displacement" but a hard
`−scale/2` shift in both axes.**

Symptom: a second, offset ghost of the entire pill. Highly visible on the text
filter, because `filter` (unlike `backdrop-filter`) does not clip to the border box.

Fix: `newMap()` generates every map `pad` px larger on all sides, filled at neutral
`128`, and the `feImage` subregion matches the filter region exactly.

### 5.2 The rim band must be guarded

The 1px border and `glass.css`'s inset rim highlights sit on the contour. Displace
them and — because the dispersive path runs three passes at different scales —
they split into three offset copies. **Symptom: a rainbow outline.**

`guardPx = 14` on the text shoulder. Verified: border-pixel shift `0.000px`.

### 5.3 Nothing outside the contour may move

Every band must be gated by an **SDF** term. Inside a rounded corner's cut-out a
pixel can be a few px below the box's top edge while lying outside the pill
entirely, and `filter` does not clip to the border radius. Symptom: chewed-up
corners and a wavy outline.

Note this is about *clipping*, which is not the same as *profiling* — see §4.3.
The reflection currently uses the SDF for both, which is why its distance to the
text varies across the width.

### 5.4 Fields must be C1 (smooth slope), not just continuous

A slope discontinuity in a displacement field is an abrupt jump in local
magnification, which paints a **crease line following the contour** — it reads as
a spurious inner border. `shoulder()` is built from smoothsteps for this reason;
plain `sin` is *not* C1 at its band ends, which is why the fold was moved out of
the body pass into its own masked layer.

Verified by second difference: worst curvature `0.064/px`.

### 5.5 Bands must close before the medial axis

`dn` tops out at `h/2`, and the inward normal **flips direction across it**. A band
reaching that far tears content down the middle. Hence `Ly = min(L, h*0.49)` and
`rOut ≤ h*0.4`.

**This is a hard geometric limit, not a preference.** It is why a single-line pill
cannot have a reflection wider than ~20px.

### 5.6 Channel capacity

A displacement channel holds at most `±0.498 × scale`. Amplitudes are declared in
**pixels** and the scale is *derived* from the worst case, rather than hand-tuned —
otherwise a fold clips flat and silently stops being a mirror.

### 5.7 The reflection must abut the text — and fade slowly into it

Two failure modes pulling in opposite directions, both reported as bugs:

| Inner taper | Symptom |
| --- | --- |
| Too early / too short a strip | dead band between glyph and reflection → reads as a **gap** |
| Too late (alpha cliff) | hard outline around the reflection area → reads as a **sharp edge** |

Both are fixed by the same two properties:

1. **`srcNear === rOut`.** At the strip's inner boundary the mirror samples its own
   depth, so the ghost is identical to the content it abuts. Mismatch elsewhere is
   `(srcFar − rIn)(1 − t)` — it shrinks to zero *at exactly the rate the ghost fades
   out*, so the pixels it overlaps are ones it nearly duplicates.
2. **A long inner taper** (the inner 60% of the strip, ~10px), running a few px past
   where ink starts so it has room to reach zero smoothly.

The number to watch is **peak fade steepness**:

```
39% alpha/px   hard edge          (a 1.4px taper)
13% alpha/px   still an outline   (a 6px taper)
 8% alpha/px   reads as gradient  ← current
```

Alpha at the ink boundary must stay non-zero (~11%) or the gap returns.

---

## 6. The dispersion zone

The RGB split must appear only where the glass bends, never mid-line.

It is *incidentally* near-zero in the centre already (split scales with local
displacement — measured `0.006px`), but this is now enforced: the shoulder map's
**B channel** carries a zone weight, which becomes an alpha mask selecting between
a plain single pass and the dispersed three-pass version.

The gate is `max(horizontal cap shoulder, rim strip)` and **deliberately excludes
the vertical shoulder** — that one is ~0.99 across an entire line near an edge, so
including it tinted whole lines edge to edge.

The rim term uses its own tight **4px** guard, not the 14px displacement guard.
That guard exists to stop the border *moving*; reusing it here gutted the mask
right where the reflection sits.

> **Second benefit.** Summing three channel-isolated layers also sums their alphas.
> This element's source is mostly translucent (a 6–14% white fill), so the
> three-pass path inflates the fill's opacity. Keeping the centre on the single
> pass confines that artifact to the thin edge zone.

---

## 7. Tuning

All in `PillGlass.tsx` unless noted. Composite dials are safe to turn without
re-verifying geometry; geometry dials are not.

| Dial | Default | Effect |
| --- | --- | --- |
| `shoulderPx` | `base * 0.5` | Horizontal text stretch. Above ~11px the leading glyph samples padding and goes hollow |
| `vShoulderPx` | `shoulderPx * 0.15` | Vertical bulge. The term that smears glyph *height* — cut this first if lines look mushy |
| `REFL_DEPTH` | `16` | How far back into the text the mirror reaches. Higher = more line mirrored, more compressed |
| `REFL_ALPHA` | `0.55` | Ghost opacity. Above ~0.75 it competes with the real text |
| `REFL_BLUR` | `1.0` | Ghost softness. Below ~0.6 the stretch reads as streaking |
| `spread` | `1 + gain*0.04` | Backdrop RGB split. `0.055` overshoots into a hard rainbow ring |
| `textSpread` | `1 + gain*0.01` | Text RGB split. Glyph strokes are ~1px, so this stays much lower than `spread` |
| `--pill-frost` | `1.6px` → `3px` | Blur at rest → when typing (`liquid-glass.css`) |
| `--pill-fill` | `0.06` → `0.14` | Fill opacity at rest → when typing |

**Live-tunable from the UI:** `refractionFactor`, `thickness` and `dispersionGain`
in the Liquid Glass Pro panel feed `base` and both spreads, so the pill responds to
the same sliders as the WebGL surfaces.

### The padding lever

The reflection can only be as wide as the **text-free strip**, which is the pill's
`padding-top` (`ChatPanel.css`). Wider than that *is* overlap with the text. To get
a broader reflection, increase the padding:

```
padding-top 13px  →  ghost strip 17.0px, inner fade 8.1% alpha/px
padding-top 20px  →  ghost strip 24.0px, inner fade 5.7% alpha/px
```

A longer strip also buys a gentler inner fade for free, since the taper is a
fraction of the strip rather than a fixed distance.

---

## 8. CSS wiring

### Filter order matters

```css
backdrop-filter: url(#pill-glass) saturate(1.5) brightness(1.05) blur(var(--pill-frost));
```

`backdrop-filter` applies functions **left to right**. A blur ahead of the lens
hands it an already-smeared backdrop, and chromatic aberration is only visible
against high-frequency detail — blur first and the fringe is mathematically present
but perceptually gone. **Lens first, frost afterwards.**

Some residual blur at rest is required, not decorative: the rim compresses the
backdrop hard and aliases into banding with none. `GlassLayer.tsx:177` frosts its
rim harder than its body for the same reason.

### Stylesheet order is not reliable

⚠️ **Bun's dev server emits stylesheets in a different order than the production
bundle** (`liquid-glass.css` lands *before* `glass.css` in dev, after it in prod).
Equal-specificity ties therefore resolve **differently in `bun dev` vs `bun build`**.

Never rely on `liquid-glass.css` overriding `glass.css` by source order. Either:

- scope the `glass.css` rule away with `:not([data-theme="liquid-glass"])`, or
- give the liquid-glass rule strictly higher specificity (e.g. the extra
  `.chat__dock` in the docked-pill selector).

There are ~13 other equal-specificity collisions between those two files that still
resolve differently between dev and prod — `.chat`/`.wpage` background,
`border-radius` on several cards, `.prompt__attach`/`.prompt__send`. Not yet fixed.

### Pill geometry

- `border-radius: 26px` — overrides `ChatPanel.css`'s `999px`. At one line the
  browser clamps it to half the height so it still renders as a pill; taller, it
  becomes a rounded rectangle. A stadium's caps curve away and leave no straight
  edge for the lens to bend text against.
- `max-height: 126px` — exactly 5 lines, then `overflow-y: auto` scrolls.

### Why the pill has a 24px transparent border

Overflow is clipped at the **padding box**, so padding cannot hold scrolled text
away from the glass edge — lines draw straight over it and vanish only on contact
with the rim. A transparent vertical border moves the padding box, and therefore
the clip, inward. It is the only way to get a real text-free margin.

```
border-width: 16px 0;  border-color: transparent;  padding: 1px 18px;
min-height: 54px;      max-height: 134px;

54  = 32 border + 2 padding + 20 line          (1 line)
134 = 32 border + 2 padding + 5 × 20           (5 lines, then scroll)
text-free margin: 17px per edge; clip sits 16px in from the glass
```

`min-height`/`max-height` must be restated in `liquid-glass.css` — ChatPanel.css's
`46`/`126` assume a 2px border, and with `box-sizing: border-box` a 32px one would
leave 12px of content, less than a single 20px line.

**The border width and the roll-off band's width are coupled.** The band's strong
region has to sit in the text-free zone or it composites over the glyphs; widening
the band therefore means widening the border too. See §4.3.

Three things had to move with it:

1. **The rim cannot be the border** (transparent) **and cannot be an inset
   shadow.** Inset shadows draw from the padding box, so `glass.css`'s three would
   land 12px inside and read as the spurious inner border that keeps getting
   reported. It is an `outline` with `outline-offset: -1px` — outlines sit on the
   border box and ignore border width.
2. **`autoGrow()` must add the border back.** `scrollHeight` is content + padding
   and *excludes* the border, but the box is `border-box`. Without the correction
   a 5-line field renders 3.8 lines and scrolls early. (This was a latent 2px bug
   before; a 24px border made it visible.)
3. **`PillGlass` must read `borderTopWidth + paddingTop`**, not `paddingTop`. The
   text-free strip is what positions the reflection; reading padding alone
   collapses it from 19px to 7px.
- Placeholder needs `text-shadow: none` — it would otherwise inherit the typed
  text's shadow. A declaration on `::placeholder` beats an inherited value
  regardless of specificity.

---

## 9. Verifying changes

There is no visual test harness. The maps are pure functions of
`(w, h, radius, padding)`, so they can be replicated headlessly in a scratch
script and asserted numerically. Properties worth re-checking after any geometry
change:

| Property | Expected |
| --- | --- |
| Interior neutral | `R=128 G=128` at the pill centre |
| Padded margin neutral | worst deviation `0.00/127` outside the element box |
| Outside contour static | worst shift `< 0.01px`, corner cut-outs included |
| Border pixel | shift `< 0.15px` |
| Centre line | shift `< 0.05px` (else the content tears) |
| Field smoothness | second difference `< 0.5/px` (else a crease appears) |
| Fold still mirrors | mapping derivative `< 0` where mask `> 0.25` |
| Reflection reaches ink | `srcFar ≥ padding-top + 3` |
| Inner fade steepness | `< 9% alpha/px` (else a visible outline) |
| Alpha at ink boundary | `> 4%` (else a dead band) |
| Ghost alpha over ink | `< 25%` (faint enough not to muddy the text) |
| No channel clipping | `|shift| ≤ 0.498 × scale` |
| Dispersion mid-line | `≈ 0px` |

Current measurements at defaults (880px wide, `padding-top: 13px`):

```
                          1 line (h=46)     5 lines (h=126)
ghost strip               2.0..19.0px       2.0..19.0px
mirrors from depth        35 → 19px         35 → 19px
reflection stretch        0.83x             0.94x
inner fade steepness      8.1% alpha/px     8.1% alpha/px
alpha at ink boundary     11%               11%
content mismatch there    0.00px            0.00px
horizontal stretch        14% per glyph      12% per glyph
dispersion mid-line       0.000px           0.000px
dispersion at rim         1.476px           1.476px
```

---

## 10. Known gaps

- **Firefox** shows plain frost — no lens, no reflection, no split.
- **The hero prompt** (`.prompt:not(.prompt--dock)`) is a WebGL surface and gets
  its refraction from `GlassLayer`, not from these filters. It has no text stretch
  or reflection.
- **The reflection is top/bottom only.** On an 880px-wide pill those are the edges
  close enough to the text to matter.
- Maps regenerate on every resize (`ResizeObserver`) — a few ms of canvas work per
  size change, including each time the textarea auto-grows a line. Fine in
  practice, but it is not free.
- Maps are generated at CSS-pixel resolution and upscaled on HiDPI displays. The
  fields are smooth so this is currently invisible.
