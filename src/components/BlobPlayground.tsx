import { useEffect, useRef, useState } from "react";
import type { LConfig } from "../glassParams";
import "./BlobPlayground.css";

// TEMP: WebGL2 metaball glass playground. Draggable blobs fuse seamlessly via a
// smooth-min SDF (like liquid-glass-studio) with refraction/dispersion/fresnel/
// glare sampling the app's background. Driven by the Liquid Glass Pro sliders.

const MAX_BLOBS = 8;

const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform sampler2D u_bg;
uniform vec2 u_bgSize;
uniform vec3 u_blobs[${MAX_BLOBS}];
uniform int u_count;
uniform float u_k, u_refract, u_disp, u_fres, u_glare, u_angle, u_blur;

float smin(float a, float b, float k){
  if(k <= 0.0) return min(a,b);
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float scene(vec2 p){
  float d = 1e9;
  for(int i=0;i<${MAX_BLOBS};i++){
    if(i >= u_count) break;
    vec3 b = u_blobs[i];
    d = smin(d, length(p - b.xy) - b.z, u_k);
  }
  return d;
}
vec2 nrm(vec2 p){
  vec2 e = vec2(1.5, 0.0);
  return normalize(vec2(
    scene(p+e.xy) - scene(p-e.xy),
    scene(p+e.yx) - scene(p-e.yx)
  ) + 1e-6);
}
vec2 bguv(vec2 f){
  vec2 uv = f / u_res;
  float sA = u_res.x/u_res.y, iA = u_bgSize.x/u_bgSize.y;
  vec2 sc = (sA > iA) ? vec2(1.0, iA/sA) : vec2(sA/iA, 1.0);
  uv = (uv - 0.5)/sc + 0.5;
  uv.y = 1.0 - uv.y;
  return uv;
}
vec3 sampleBg(vec2 uv, float blur){
  if(blur < 0.5) return texture(u_bg, uv).rgb;
  vec3 c = vec3(0.0);
  float t = 0.0;
  for(int i=-2;i<=2;i++){
    for(int j=-2;j<=2;j++){
      vec2 off = vec2(float(i), float(j)) * (blur*0.5) / u_res;
      c += texture(u_bg, uv + off).rgb;
      t += 1.0;
    }
  }
  return c / t;
}
void main(){
  vec2 f = gl_FragCoord.xy;
  float d = scene(f);
  if(d > 1.5){ o = vec4(0.0); return; }

  vec2 n = nrm(f);
  float ef = pow(clamp(1.0 + d/34.0, 0.0, 1.0), 1.6); // edge factor (1 at rim)

  vec2 base = bguv(f);
  float refPx = u_refract * ef * 22.0;
  vec2 offuv = (n * refPx) / u_res;
  float dispA = u_disp * ef;

  vec3 col;
  col.r = sampleBg(base + offuv * (1.0 + dispA), u_blur).r;
  col.g = sampleBg(base + offuv, u_blur).g;
  col.b = sampleBg(base + offuv * (1.0 - dispA), u_blur).b;

  // fresnel rim
  float fr = pow(clamp(1.0 + d/7.0, 0.0, 1.0), 3.0) * u_fres;
  col = mix(col, vec3(1.0), clamp(fr*0.6, 0.0, 0.85));

  // directional glare
  vec2 gd = vec2(cos(u_angle), sin(u_angle));
  float g = pow(clamp(dot(n, gd)*0.5 + 0.5, 0.0, 1.0), 5.0) * ef * u_glare;
  col += vec3(g * 0.7);

  float a = 1.0 - smoothstep(-1.0, 1.5, d); // AA edge
  o = vec4(clamp(col, 0.0, 1.0), a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[blob] shader error:", gl.getShaderInfoLog(sh));
  }
  return sh;
}

interface Blob {
  id: number;
  x: number;
  y: number;
  r: number;
}

export default function BlobPlayground({ config }: { config: LConfig }) {
  const [collapsed, setCollapsed] = useState(false);
  const [blobs, setBlobs] = useState<Blob[]>(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return [
      { id: 1, x: cx - 110, y: cy, r: 72 },
      { id: 2, x: cx + 20, y: cy + 20, r: 84 },
      { id: 3, x: cx + 150, y: cy - 30, r: 58 },
    ];
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobsRef = useRef(blobs);
  const configRef = useRef(config);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  blobsRef.current = blobs;
  configRef.current = config;

  // WebGL init + render loop (runs while expanded)
  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      console.warn("[blob] WebGL2 unavailable");
      return;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const U = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = U("u_res"),
      uBgSize = U("u_bgSize"),
      uBlobs = U("u_blobs"),
      uCount = U("u_count"),
      uK = U("u_k"),
      uRefract = U("u_refract"),
      uDisp = U("u_disp"),
      uFres = U("u_fres"),
      uGlare = U("u_glare"),
      uAngle = U("u_angle"),
      uBlur = U("u_blur");

    // background texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 48, 64, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let bgW = 1,
      bgH = 1;
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      bgW = img.naturalWidth;
      bgH = img.naturalHeight;
    };
    img.src = "/images/img2.jpg";

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    const arr = new Float32Array(MAX_BLOBS * 3);
    let raf = 0;
    const render = () => {
      const c = configRef.current ?? {};
      const n = (k: string) => Number(c[k] ?? 0);
      const bs = blobsRef.current.slice(0, MAX_BLOBS);
      for (let i = 0; i < bs.length; i++) {
        arr[i * 3] = bs[i]!.x * dpr;
        arr[i * 3 + 1] = (window.innerHeight - bs[i]!.y) * dpr; // flip Y for GL
        arr[i * 3 + 2] = bs[i]!.r * dpr;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uBgSize, bgW, bgH);
      gl.uniform3fv(uBlobs, arr);
      gl.uniform1i(uCount, bs.length);
      gl.uniform1f(uK, n("mergeRate") * 90 * dpr); // smooth-min radius
      gl.uniform1f(uRefract, n("refractionFactor"));
      gl.uniform1f(uDisp, n("dispersionGain") * 0.06);
      gl.uniform1f(uFres, n("fresnelIntensity") / 100);
      gl.uniform1f(uGlare, n("glareIntensity") / 100);
      gl.uniform1f(uAngle, (n("glareAngle") * Math.PI) / 180);
      gl.uniform1f(uBlur, n("blurRadius") * dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(prog);
      gl.deleteTexture(tex);
    };
  }, [collapsed]);

  // --- drag handles (transparent DOM circles over each blob) ---
  const onDown = (e: React.PointerEvent, b: Blob) => {
    drag.current = { id: b.id, dx: e.clientX - b.x, dy: e.clientY - b.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setBlobs((bs) =>
      bs.map((b) =>
        b.id === d.id ? { ...b, x: e.clientX - d.dx, y: e.clientY - d.dy } : b,
      ),
    );
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  if (collapsed) {
    return (
      <button
        type="button"
        className="lg-blob-toggle lg-blob-toggle--show"
        onClick={() => setCollapsed(false)}
      >
        Show glass blobs
      </button>
    );
  }

  return (
    <>
      <canvas ref={canvasRef} className="glassblob-canvas" />
      {blobs.map((b) => (
        <div
          key={b.id}
          className="glassblob-handle"
          style={{ left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2 }}
          onPointerDown={(e) => onDown(e, b)}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
      ))}
      <button
        type="button"
        className="lg-blob-toggle lg-blob-toggle--collapse"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse blobs"
        title="Collapse blobs"
      >
        ×
      </button>
    </>
  );
}
