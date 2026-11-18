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

async function getOpensAt(db, isTest) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?1").bind(isTest ? "test_opens_at" : "opens_at").first();
  return row ? Number(row.value) : 0;
}

// Changes every time the admin resets a list, so devices that signed up in a rehearsal are released.
async function getRound(db, isTest) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?1").bind(isTest ? "test_round" : "round").first();
  return row ? row.value : "0";
}

async function counts(db, T) {
  const { results } = await db.prepare(`SELECT chapter, COUNT(*) AS n FROM ${T} GROUP BY chapter`).all();
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
      // Test mode keeps its own list (test_signups), ignores the opening time and never shows on the public pages.
      const isTest = url.searchParams.get("mode") === "test";
      const T = isTest ? "test_signups" : "signups";
      // Chapters with seat counts only (no names) — used by the sign-up page.
      if (url.pathname === "/api/chapters" && req.method === "GET") {
        const c = await counts(db, T);
        let mine = null;
        const who = url.searchParams.get("name");
        if (who) {
          const row = await db.prepare(`SELECT chapter FROM ${T} WHERE name_key = ?1`).bind(nameKey(who)).first();
          if (row) mine = row.chapter;
        }
        return json({
          cap: CAP,
          mine,
          opensAt: await getOpensAt(db, isTest),
          round: await getRound(db, isTest),
          test: isTest,
          now: Date.now(),
          chapters: CHAPTERS.map((title, id) => ({ id, title, taken: c[id], left: Math.max(0, CAP - c[id]) })),
        });
      }

      // Everyone and their chapter — used by the "who picked what" page.
      if (url.pathname === "/api/roster" && req.method === "GET") {
        const { results } = await db
          .prepare(`SELECT id, name, chapter, created_at FROM ${T} ORDER BY chapter, created_at`)
          .all();
        return json({ cap: CAP, chapters: CHAPTERS, signups: results, opensAt: await getOpensAt(db, isTest), test: isTest, now: Date.now() });
      }

      if (url.pathname === "/api/signup" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const name = cleanName(body.name);
        const ch = Number(body.chapter);
        if (!name) return json({ error: "Please type your name." }, 400);
        if (!Number.isInteger(ch) || ch < 0 || ch >= CHAPTERS.length)
          return json({ error: "Please pick a chapter." }, 400);
        const opensAt = await getOpensAt(db, isTest);
        if (Date.now() < opensAt) return json({ error: "Sign-up hasn't opened yet. Wait for the countdown to finish.", notOpen: true, opensAt }, 403);
        const key = nameKey(name);
        const existing = await db.prepare(`SELECT chapter FROM ${T} WHERE name_key = ?1`).bind(key).first();
        if (existing)
          return json({ error: `${name} has already signed up for chapter ${existing.chapter + 1} (${CHAPTERS[existing.chapter]}).`, already: true }, 409);
        // Atomic: only writes when the chapter still has room.
        let res;
        try {
          res = await db
            .prepare(
              `INSERT INTO ${T} (name, name_key, chapter, created_at)
               SELECT ?1, ?2, ?3, ?4
               WHERE (SELECT COUNT(*) FROM ${T} WHERE chapter = ?3) < ?5`
            )
            .bind(name, key, ch, Date.now(), CAP)
            .run();
        } catch (e) {
          if (String(e).includes("UNIQUE")) return json({ error: `${name} has already signed up.`, already: true }, 409);
          throw e;
        }
        if (!res.meta.changes)
          return json({ error: `"${CHAPTERS[ch]}" just filled up. Please pick another chapter.`, full: true }, 409);
        return json({ ok: true, name, chapter: ch, title: CHAPTERS[ch], at: Date.now(), test: isTest, round: await getRound(db, isTest) });
      }

      // Admin: remove one person or reset everything.
      if (url.pathname.startsWith("/api/admin/") && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (!env.ADMIN_KEY || body.key !== env.ADMIN_KEY) return json({ error: "Wrong admin password." }, 401);
        if (url.pathname === "/api/admin/check") return json({ ok: true });
        if (url.pathname === "/api/admin/remove") {
          await db.prepare(`DELETE FROM ${T} WHERE id = ?1`).bind(Number(body.id)).run();
          return json({ ok: true });
        }
        if (url.pathname === "/api/admin/open") {
          const t = Number(body.opensAt) || 0;
          await db.prepare("INSERT INTO settings (key, value) VALUES (?2, ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(t), isTest ? "test_opens_at" : "opens_at").run();
          return json({ ok: true, opensAt: t });
        }
        if (url.pathname === "/api/admin/reset") {
          await db.batch([
            db.prepare(`DELETE FROM ${T}`),
            db.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
              .bind(isTest ? "test_round" : "round", String(Date.now())),
          ]);
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
