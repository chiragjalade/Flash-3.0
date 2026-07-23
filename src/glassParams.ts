// Full liquid-glass parameter set (mirrors @ybouane/liquidglass).
// Drives the content components/buttons via CSS (backdrop-filter +
// SVG displacement + composed shadows). A few (fresnel, specular,
// zRadius, chromAberration) are CSS approximations of the WebGL shader.

export interface GlassParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const GLASS_PARAMS: GlassParam[] = [
  { key: "refraction", label: "Refraction", min: 0, max: 2, step: 0.01 },
  { key: "blurAmount", label: "Blur", min: 0, max: 1, step: 0.01 },
  { key: "chromAberration", label: "Chromatic Aberration", min: 0, max: 0.5, step: 0.005 },
  { key: "edgeHighlight", label: "Edge Highlight", min: 0, max: 1, step: 0.01 },
  { key: "specular", label: "Specular", min: 0, max: 1, step: 0.01 },
  { key: "fresnel", label: "Fresnel", min: 0, max: 2, step: 0.01 },
  { key: "distortion", label: "Distortion", min: 0, max: 1, step: 0.01 },
  { key: "cornerRadius", label: "Corner Radius", min: 0, max: 48, step: 1 },
  { key: "zRadius", label: "Bevel Depth (zRadius)", min: 0, max: 60, step: 1 },
  { key: "opacity", label: "Fill Opacity", min: 0, max: 1, step: 0.01 },
  { key: "saturation", label: "Saturation", min: -1, max: 1, step: 0.01 },
  { key: "tintStrength", label: "Tint Strength", min: 0, max: 1, step: 0.01 },
  { key: "brightness", label: "Brightness", min: -0.5, max: 0.5, step: 0.01 },
  { key: "shadowOpacity", label: "Shadow Opacity", min: 0, max: 1, step: 0.01 },
  { key: "shadowSpread", label: "Shadow Spread", min: 0, max: 40, step: 1 },
  { key: "shadowOffsetY", label: "Shadow Offset Y", min: -20, max: 20, step: 1 },
];

export type GlassConfig = Record<string, number>;

// Liquid Glass Pro — its own parameter set for the dedicated bottom-right panel.
// Covers every effect from the reference project (iyinchao/liquid-glass-studio).
export type LType = "range" | "boolean" | "color";

export interface LParam {
  key: string;
  label: string;
  section: string;
  type?: LType; // default "range"
  min?: number;
  max?: number;
  step?: number;
}

export type LConfig = Record<string, number | boolean | string>;

export const LIQUID_GLASS_PARAMS: LParam[] = [
  // --- Basic Settings ---
  { key: "thickness", label: "Thickness", section: "Basic Settings", min: 0, max: 50, step: 0.01 },
  { key: "refractionFactor", label: "Refraction Factor", section: "Basic Settings", min: 0, max: 6, step: 0.01 },
  { key: "dispersionGain", label: "Dispersion Gain", section: "Basic Settings", min: 0, max: 20, step: 0.01 },
  { key: "fresnelSize", label: "Fresnel Size", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "fresnelHardness", label: "Fresnel Hardness", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "fresnelIntensity", label: "Fresnel Intensity", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "glareSize", label: "Glare Size", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "glareHardness", label: "Glare Hardness", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "glareIntensity", label: "Glare Intensity", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "glareConvergence", label: "Glare Convergence", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "glareOppositeSide", label: "Glare Opposite Side", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "glareAngle", label: "Glare Angle", section: "Basic Settings", min: -180, max: 180, step: 0.01 },
  { key: "blurRadius", label: "Blur Radius", section: "Basic Settings", min: 0, max: 200, step: 1 },
  { key: "blurEdge", label: "Blur Edge", section: "Basic Settings", type: "boolean" },
  { key: "tint", label: "Tint", section: "Basic Settings", type: "color" },
  { key: "shadowExpand", label: "Shadow Expand", section: "Basic Settings", min: 0, max: 50, step: 0.01 },
  { key: "shadowIntensity", label: "Shadow Intensity", section: "Basic Settings", min: 0, max: 100, step: 0.01 },
  { key: "shadowX", label: "Shadow Position X", section: "Basic Settings", min: -50, max: 50, step: 1 },
  { key: "shadowY", label: "Shadow Position Y", section: "Basic Settings", min: -50, max: 50, step: 1 },
  // --- Shape Settings (drive the Blob Merge preview) ---
  { key: "width", label: "Width", section: "Shape Settings", min: 50, max: 500, step: 1 },
  { key: "height", label: "Height", section: "Shape Settings", min: 50, max: 400, step: 1 },
  { key: "radiusPct", label: "Radius (%)", section: "Shape Settings", min: 0, max: 100, step: 0.01 },
  { key: "superEllipse", label: "SuperEllipse Factor", section: "Shape Settings", min: 1, max: 10, step: 0.01 },
  { key: "mergeRate", label: "Merge Rate", section: "Shape Settings", min: 0, max: 1, step: 0.01 },
  { key: "show2nd", label: "Show 2nd Shape", section: "Shape Settings", type: "boolean" },
  // --- Animation Settings ---
  { key: "animMorph", label: "Animation Morph", section: "Animation Settings", min: 0, max: 30, step: 0.01 },
];

export const LIQUID_GLASS_DEFAULTS: LConfig = {
  thickness: 20,
  refractionFactor: 3.16,
  dispersionGain: 7,
  fresnelSize: 30,
  fresnelHardness: 20,
  fresnelIntensity: 20,
  glareSize: 30,
  glareHardness: 20,
  glareIntensity: 90,
  glareConvergence: 50,
  glareOppositeSide: 80,
  glareAngle: -45,
  blurRadius: 4,
  blurEdge: true,
  tint: "#ffffff00",
  shadowExpand: 25,
  shadowIntensity: 15,
  shadowX: 0,
  shadowY: -10,
  width: 412,
  height: 200,
  radiusPct: 44.6,
  superEllipse: 5,
  mergeRate: 0.05,
  show2nd: true,
  animMorph: 23.74,
};

// Glass-friendly starting values (the library's raw WebGL defaults would look
// opaque/sharp as CSS, so blur/opacity/saturation start in a glassy range).
export const GLASS_DEFAULTS: GlassConfig = {
  refraction: 1.26,
  blurAmount: 0.25,
  chromAberration: 0.02,
  edgeHighlight: 0.18,
  specular: 0.48,
  fresnel: 0.6,
  distortion: 0.2,
  cornerRadius: 8,
  zRadius: 1,
  opacity: 0.16,
  saturation: 1.0,
  tintStrength: 0.15,
  brightness: 0.1,
  shadowOpacity: 0.16,
  shadowSpread: 11,
  shadowOffsetY: 10,
};
