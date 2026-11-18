import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { parseConfig } from "./config.js";
import { lookup } from "./lookup.js";
import { manifest } from "./manifest.js";
import { toStreams } from "./stream.js";

type Bindings = Env & { TMDB_TOKEN?: string };

const app = new Hono<{ Bindings: Bindings }>({ strict: false });

app.use("*", cors());

const IMDB_ID = /^tt\d{5,10}$/;
// Stremio caches the answer itself when told to (seconds).
const STREAM_CACHE = { cacheMaxAge: 6 * 60 * 60, staleRevalidate: 24 * 60 * 60, staleError: 7 * 24 * 60 * 60 };

app.get("/health", (c) => c.json({ ok: true }));

// The configure page is a static asset; Stremio opens it at {base}/configure.
const configurePage = (c: Context<{ Bindings: Bindings }>) =>
  c.env.ASSETS.fetch(new URL("/", c.req.url));
app.get("/configure", (c) => configurePage(c));
app.get("/:config/configure", (c) => configurePage(c));

app.get("/manifest.json", (c) => c.json(manifest(parseConfig(undefined), new URL(c.req.url).origin)));
app.get("/:config/manifest.json", (c) =>
  c.json(manifest(parseConfig(c.req.param("config")), new URL(c.req.url).origin)),
);

async function streams(c: Context<{ Bindings: Bindings }>, configSegment?: string) {
  const type = c.req.param("type");
  const id = (c.req.param("id") ?? "").replace(/\.json$/, "");
  if (type !== "movie" || !IMDB_ID.test(id)) return c.json({ streams: [] });

  try {
    const found = await lookup(id, c.env, (p) => c.executionCtx.waitUntil(p));
    const result = found ? toStreams(found.verdict, parseConfig(configSegment)) : [];
    // Short on the HTTP side so a fix reaches clients within the hour;
    // Stremio's own cache follows cacheMaxAge in the body.
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({ streams: result, ...STREAM_CACHE });
  } catch (error) {
    console.error(JSON.stringify({ event: "stream-error", id, error: String(error) }));
    return c.json({ streams: [] });
  }
}

app.get("/stream/:type/:id", (c) => streams(c));
app.get("/:config/stream/:type/:id", (c) => streams(c, c.req.param("config")));

// Debug view: the verdict and, on a fresh lookup, what every source said.
// ?fresh=1 skips the cache only on a local `wrangler dev`, so the public
// instance cannot be used to hammer the sites.
app.get("/api/check/:id", async (c) => {
  const id = c.req.param("id").replace(/\.json$/, "");
  if (!IMDB_ID.test(id)) return c.json({ error: "expected an IMDb id like tt1234567" }, 400);
  const local = ["localhost", "127.0.0.1"].includes(new URL(c.req.url).hostname);
  const fresh = local && c.req.query("fresh") === "1";
  try {
    const found = await lookup(id, c.env, (p) => c.executionCtx.waitUntil(p), { fresh });
    if (!found) return c.json({ error: "Cinemeta does not know this id" }, 404);
    const streams = { en: toStreams(found.verdict, parseConfig("en")), es: toStreams(found.verdict, parseConfig("es")) };
    return c.json({ ...found, streams });
  } catch (error) {
    return c.json({ error: String(error) }, 502);
  }
});

export default app;
