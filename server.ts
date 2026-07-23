import { join, normalize } from "node:path";
import index from "./index.html";

const ICON_DIR = join(import.meta.dir, "src/assets/icons");
const IMAGE_DIR = join(import.meta.dir, "src/assets/images");

const safeName = (name: string) =>
  normalize(name).replace(/^(\.\.(\/|\\|$))+/, "");

const server = Bun.serve({
  port: 4173,
  routes: {
    "/": index,
    "/icons/:file": (req) =>
      new Response(Bun.file(join(ICON_DIR, safeName(req.params.file)))),
    "/images/:file": (req) =>
      new Response(Bun.file(join(IMAGE_DIR, safeName(req.params.file)))),
    // News about the followed companies, proxied so the GNews key stays
    // server-side (set GNEWS_API_KEY in .env). Returns raw GNews articles.
    "/api/company-news": async (req) => {
      const key = process.env.GNEWS_API_KEY;
      const u = new URL(req.url);
      const q = u.searchParams.get("q") ?? "";
      const max = u.searchParams.get("max") ?? "4";
      if (!key || !q) return Response.json({ articles: [] });
      try {
        const gurl =
          `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}` +
          `&lang=en&max=${max}&sortby=publishedAt&apikey=${key}`;
        const r = await fetch(gurl);
        if (!r.ok) throw new Error(`GNews ${r.status}`);
        const data = await r.json();
        return Response.json(
          { articles: data.articles ?? [] },
          { headers: { "cache-control": "public, max-age=300" } },
        );
      } catch (e) {
        console.warn("[news] proxy failed:", e);
        return Response.json({ articles: [] });
      }
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Flash running at ${server.url}`);
