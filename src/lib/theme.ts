// The cursor-follow tilt on cards belongs to the glass themes only: against a
// refracting surface it reads as depth (the highlight and the refraction shift
// with it), while against the flat themes the same rotation is just a card that
// wobbles for no reason.
//
// Read live off <html> rather than threading a `theme` prop down. That attribute
// is the same source every stylesheet keys off, and the tilt is only ever
// consulted inside pointer handlers — so it is always current, including when the
// theme changes mid-hover, with no re-render.
export function isGlassTheme() {
  const t =
    typeof document !== "undefined"
      ? (document.documentElement.getAttribute("data-theme") ?? "")
      : "";
  return t.includes("glass"); // matches both `glass` and `liquid-glass`
}
