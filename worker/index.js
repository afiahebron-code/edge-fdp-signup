// Edge FDP chapter sign-up API (Cloudflare Worker + D1)
const CAP = 2;
const CHAPTERS = [
  "Executive Summary",
  "Asset Description",
  "Development Overview",
  "Production Sustainability (Surveillance, Analysis & Optimization)",
  "Well Design, Philosophy and Strategy",
  "Surface Facilities: Description, Considerations and Costs",
  "Facilities: Processing and Operations Philosophy",
  "HSSE Considerations",
  "Field Abandonment and Decommissioning",
  "Stakeholder Management",
  "Project Economics",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
  });

const cleanName = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 60);
const nameKey = (s) => cleanName(s).toLowerCase();

async function counts(db) {
  const { results } = await db.prepare("SELECT chapter, COUNT(*) AS n FROM signups GROUP BY chapter").all();
  const c = Array(CHAPTERS.length).fill(0);
  for (const r of results) c[r.chapter] = r.n;
  return c;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const db = env.DB;
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      // Chapters with seat counts only (no names) — used by the sign-up page.
      if (url.pathname === "/api/chapters" && req.method === "GET") {
        const c = await counts(db);
        let mine = null;
        const who = url.searchParams.get("name");
        if (who) {
          const row = await db.prepare("SELECT chapter FROM signups WHERE name_key = ?1").bind(nameKey(who)).first();
          if (row) mine = row.chapter;
        }
        return json({
          cap: CAP,
          mine,
          chapters: CHAPTERS.map((title, id) => ({ id, title, taken: c[id], left: Math.max(0, CAP - c[id]) })),
        });
      }

      // Everyone and their chapter — used by the "who picked what" page.
      if (url.pathname === "/api/roster" && req.method === "GET") {
        const { results } = await db
          .prepare("SELECT id, name, chapter, created_at FROM signups ORDER BY chapter, created_at")
          .all();
        return json({ cap: CAP, chapters: CHAPTERS, signups: results });
      }

      if (url.pathname === "/api/signup" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const name = cleanName(body.name);
        const ch = Number(body.chapter);
        if (!name) return json({ error: "Please type your name." }, 400);
        if (!Number.isInteger(ch) || ch < 0 || ch >= CHAPTERS.length)
          return json({ error: "Please pick a chapter." }, 400);
        const key = nameKey(name);
        // Atomic: only writes when the chapter still has room (not counting this person).
        const res = await db
          .prepare(
            `INSERT INTO signups (name, name_key, chapter, created_at)
             SELECT ?1, ?2, ?3, ?4
             WHERE (SELECT COUNT(*) FROM signups WHERE chapter = ?3 AND name_key <> ?2) < ?5
             ON CONFLICT(name_key) DO UPDATE SET name = excluded.name, chapter = excluded.chapter, created_at = excluded.created_at`
          )
          .bind(name, key, ch, Date.now(), CAP)
          .run();
        if (!res.meta.changes)
          return json({ error: `"${CHAPTERS[ch]}" just filled up. Please pick another chapter.`, full: true }, 409);
        return json({ ok: true, name, chapter: ch, title: CHAPTERS[ch] });
      }

      // Admin: remove one person or reset everything.
      if (url.pathname.startsWith("/api/admin/") && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (!env.ADMIN_KEY || body.key !== env.ADMIN_KEY) return json({ error: "Wrong admin password." }, 401);
        if (url.pathname === "/api/admin/check") return json({ ok: true });
        if (url.pathname === "/api/admin/remove") {
          await db.prepare("DELETE FROM signups WHERE id = ?1").bind(Number(body.id)).run();
          return json({ ok: true });
        }
        if (url.pathname === "/api/admin/reset") {
          await db.prepare("DELETE FROM signups").run();
          return json({ ok: true });
        }
      }

      if (url.pathname === "/") return json({ ok: true, service: "Edge FDP sign-up API" });
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: "Something went wrong on the server. Try again." }, 500);
    }
  },
};
