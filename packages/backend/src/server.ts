import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { DB_PATH, getDb } from "./db.js";
import { generateHeuristicSummary, generateSummaryWithOllama, SessionPayload, TabData } from "./summary.js";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

// Health check
app.get("/", (c) => {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM sessions").get() as { count: number };
  return c.json({
    status: "ok",
    db_path: DB_PATH,
    session_count: row.count,
  });
});

// POST /api/sessions — ingest session from extension
app.post("/api/sessions", async (c) => {
  const body = (await c.req.json()) as SessionPayload;
  const db = getDb();

  const tabs = Object.values(body.tabs || {}).filter((t): t is TabData & { domain: string } => !!t.domain);
  const endTime = body.endTime || Date.now();
  const startTime = body.startTime || endTime;
  const duration = body.duration || Math.round((endTime - startTime) / 1000);

  let summary: string;
  if (process.env.CTX_USE_LLM === "true") {
    try {
      summary = await generateSummaryWithOllama(body);
    } catch {
      summary = generateHeuristicSummary(body);
    }
  } else {
    summary = generateHeuristicSummary(body);
  }

  const existing = db.prepare("SELECT id FROM sessions WHERE id = ?").get(body.id);
  if (existing) {
    db.prepare(`UPDATE sessions SET end_time=?, duration=?, tab_count=?, summary=?, raw_data=? WHERE id=?`).run(
      endTime,
      duration,
      tabs.length,
      summary,
      JSON.stringify(body),
      body.id
    );
    db.prepare("DELETE FROM tabs WHERE session_id = ?").run(body.id);
    db.prepare("DELETE FROM highlights WHERE session_id = ?").run(body.id);
  } else {
    db.prepare(`INSERT INTO sessions (id, start_time, end_time, duration, tab_count, summary, raw_data) VALUES (?,?,?,?,?,?,?)`).run(
      body.id,
      startTime,
      endTime,
      duration,
      tabs.length,
      summary,
      JSON.stringify(body)
    );
  }

  const insertTab = db.prepare(
    `INSERT INTO tabs (session_id, url, domain, title, time_spent, scroll_depth, highlights, search_query) VALUES (?,?,?,?,?,?,?,?)`
  );
  for (const tab of tabs) {
    insertTab.run(
      body.id,
      tab.url || null,
      tab.domain,
      tab.title || null,
      tab.timeSpent || 0,
      tab.scrollDepth || 0,
      JSON.stringify(tab.highlights || []),
      tab.searchQuery || null
    );
  }

  const insertHighlight = db.prepare(
    `INSERT INTO highlights (session_id, text, url, title, timestamp) VALUES (?,?,?,?,?)`
  );
  for (const h of body.highlights || []) {
    insertHighlight.run(body.id, h.text, h.url || null, h.title || null, h.timestamp || null);
  }

  return c.json({ id: body.id, summary });
});

// GET /api/sessions
app.get("/api/sessions", (c) => {
  const db = getDb();
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const sessions = db
    .prepare(
      `SELECT id, start_time, end_time, duration, tab_count, summary FROM sessions ORDER BY start_time DESC LIMIT ?`
    )
    .all(limit);
  return c.json(sessions);
});

// GET /api/sessions/:id
app.get("/api/sessions/:id", (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
  if (!session) return c.json({ error: "Not found" }, 404);

  const tabs = db.prepare("SELECT * FROM tabs WHERE session_id = ?").all(id);
  const highlights = db.prepare("SELECT * FROM highlights WHERE session_id = ?").all(id);

  return c.json({ ...session, tabs, highlights });
});

// GET /api/resume
app.get("/api/resume", (c) => {
  const db = getDb();
  const session = db
    .prepare(
      `SELECT id, start_time, end_time, duration, tab_count, summary FROM sessions ORDER BY start_time DESC LIMIT 1`
    )
    .get() as
    | { id: string; start_time: number; end_time: number; duration: number; tab_count: number; summary: string }
    | undefined;

  if (!session) return c.json({ error: "No sessions found" }, 404);

  const tabs = db
    .prepare(
      `SELECT title, domain, time_spent, scroll_depth FROM tabs WHERE session_id = ? ORDER BY time_spent DESC LIMIT 10`
    )
    .all(session.id) as Array<{ title: string; domain: string; time_spent: number; scroll_depth: number }>;

  const highlights = db
    .prepare("SELECT text FROM highlights WHERE session_id = ? LIMIT 5")
    .all(session.id) as Array<{ text: string }>;

  const rawRow = db.prepare("SELECT raw_data FROM sessions WHERE id = ?").get(session.id) as
    | { raw_data: string }
    | undefined;
  let searchQueries: string[] = [];
  if (rawRow?.raw_data) {
    try {
      const raw = JSON.parse(rawRow.raw_data) as SessionPayload;
      searchQueries = raw.searchQueries || [];
    } catch {
      // ignore parse errors
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = Math.floor(session.start_time / 1000);
  const diffSec = nowSec - startSec;
  let timeAgo: string;
  if (diffSec < 3600) {
    timeAgo = `${Math.round(diffSec / 60)}m ago`;
  } else if (diffSec < 86400) {
    timeAgo = `${Math.round(diffSec / 3600)}h ago`;
  } else {
    timeAgo = `${Math.round(diffSec / 86400)}d ago`;
  }

  const durationMin = Math.round((session.duration || 0) / 60);
  const durationStr = durationMin < 60 ? `${durationMin}m` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

  const formatMinutes = (secs: number) => {
    const m = Math.round(secs / 60);
    return `${m}m`;
  };

  return c.json({
    session_id: session.id,
    time_ago: timeAgo,
    duration: durationStr,
    summary: session.summary,
    top_tabs: tabs.map((t) => ({
      title: t.title,
      domain: t.domain,
      time_spent: formatMinutes(t.time_spent),
      scroll_depth: `${t.scroll_depth}%`,
    })),
    highlights: highlights.map((h) => h.text),
    search_queries: searchQueries,
  });
});

// DELETE /api/sessions
app.delete("/api/sessions", (c) => {
  const db = getDb();
  db.prepare("DELETE FROM highlights").run();
  db.prepare("DELETE FROM tabs").run();
  db.prepare("DELETE FROM sessions").run();
  return c.json({ success: true });
});

const PORT = parseInt(process.env.CTX_PORT || "7331", 10);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`ctx backend running on http://localhost:${PORT}`);
  console.log(`database: ${DB_PATH}`);
});

export default app;
