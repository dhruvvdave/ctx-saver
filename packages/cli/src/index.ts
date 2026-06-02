#!/usr/bin/env node
import chalk from "chalk";
import Table from "cli-table3";
import * as readline from "readline";

const BACKEND = process.env.CTX_BACKEND || "http://localhost:7331";

async function fetchBackend(path: string, options?: RequestInit): Promise<Response> {
  const url = `${BACKEND}${path}`;
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5000),
  });
  return response;
}

function backendError(): never {
  console.error(
    chalk.red("ctx backend not running") +
      chalk.dim(" — start it with: ") +
      chalk.cyan("ctx serve")
  );
  process.exit(1);
}

async function cmdResume(): Promise<void> {
  let data: {
    session_id: string;
    time_ago: string;
    duration: string;
    summary: string;
    top_tabs: Array<{ title: string; domain: string; time_spent: string; scroll_depth: string }>;
    highlights: string[];
    search_queries: string[];
  };

  try {
    const res = await fetchBackend("/api/resume");
    if (res.status === 404) {
      console.log(chalk.dim("No sessions recorded yet."));
      return;
    }
    if (!res.ok) {
      console.error(chalk.red(`Backend error: ${res.status}`));
      process.exit(1);
    }
    data = await res.json();
  } catch {
    backendError();
  }

  console.log();
  console.log(
    chalk.hex("#c8f135").bold("ctx") +
      chalk.dim(" · last session ") +
      chalk.white(data.time_ago) +
      chalk.dim(" (") +
      chalk.white(data.duration) +
      chalk.dim(")")
  );
  console.log();

  if (data.summary) {
    console.log("  " + chalk.italic(data.summary));
    console.log();
  }

  if (data.top_tabs.length > 0) {
    const table = new Table({
      head: [
        chalk.dim("Tab"),
        chalk.dim("Time"),
        chalk.dim("Scroll"),
      ],
      colWidths: [45, 8, 8],
      style: { head: [], border: ["dim"] },
      chars: {
        top: "─", "top-mid": "─", "top-left": "─", "top-right": "─",
        bottom: "─", "bottom-mid": "─", "bottom-left": "─", "bottom-right": "─",
        left: " ", "left-mid": " ", mid: "─", "mid-mid": "─",
        right: " ", "right-mid": " ", middle: "  ",
      },
    });

    for (const tab of data.top_tabs) {
      const title = tab.title
        ? tab.title.slice(0, 42)
        : chalk.dim(`(${tab.domain})`);
      table.push([title, chalk.cyan(tab.time_spent), chalk.dim(tab.scroll_depth)]);
    }

    const lines = table.toString().split("\n");
    for (const line of lines) {
      console.log("  " + line);
    }
    console.log();
  }

  if (data.search_queries.length > 0) {
    console.log(
      "  " +
        chalk.dim("Searched: ") +
        data.search_queries.map((q) => chalk.white(q)).join(chalk.dim(" · "))
    );
    console.log();
  }

  if (data.highlights.length > 0) {
    console.log("  " + chalk.dim("Highlights:"));
    for (const h of data.highlights) {
      console.log("  " + chalk.hex("#c8f135")("·") + " " + chalk.italic(h.slice(0, 120)));
    }
    console.log();
  }
}

async function cmdSessions(): Promise<void> {
  let sessions: Array<{
    id: string;
    start_time: number;
    duration: number;
    tab_count: number;
    summary: string;
  }>;

  try {
    const res = await fetchBackend("/api/sessions?limit=10");
    if (!res.ok) {
      console.error(chalk.red(`Backend error: ${res.status}`));
      process.exit(1);
    }
    sessions = await res.json();
  } catch {
    backendError();
  }

  if (sessions.length === 0) {
    console.log(chalk.dim("No sessions recorded yet."));
    return;
  }

  console.log();
  console.log(chalk.hex("#c8f135").bold("ctx") + chalk.dim(" · recent sessions"));
  console.log();

  const now = Date.now();
  for (const s of sessions) {
    const startMs = s.start_time > 1e12 ? s.start_time : s.start_time * 1000;
    const diffSec = Math.floor((now - startMs) / 1000);
    let timeAgo: string;
    if (diffSec < 3600) {
      timeAgo = `${Math.round(diffSec / 60)}m ago`;
    } else if (diffSec < 86400) {
      timeAgo = `${Math.round(diffSec / 3600)}h ago`;
    } else {
      timeAgo = `${Math.round(diffSec / 86400)}d ago`;
    }

    const durationMin = Math.round((s.duration || 0) / 60);
    const durationStr =
      durationMin < 60
        ? `${durationMin}m`
        : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

    const tabLabel = `${s.tab_count} tab${s.tab_count !== 1 ? "s" : ""}`;

    console.log(
      "  " +
        chalk.white(timeAgo.padEnd(10)) +
        chalk.dim("(") +
        chalk.cyan(durationStr) +
        chalk.dim(")") +
        "  " +
        chalk.dim(tabLabel.padEnd(8)) +
        "  " +
        chalk.italic((s.summary || "").slice(0, 70))
    );
  }
  console.log();
}

async function cmdClear(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) =>
    rl.question(chalk.yellow("Clear all sessions? This cannot be undone. [y/N] "), resolve)
  );
  rl.close();

  if (answer.toLowerCase() !== "y") {
    console.log(chalk.dim("Aborted."));
    return;
  }

  try {
    const res = await fetchBackend("/api/sessions", { method: "DELETE" });
    if (!res.ok) {
      console.error(chalk.red(`Backend error: ${res.status}`));
      process.exit(1);
    }
    console.log(chalk.hex("#c8f135")("✓") + " All sessions cleared.");
  } catch {
    backendError();
  }
}

async function cmdServe(): Promise<void> {
  console.log(chalk.dim("Starting ctx backend..."));
  const { spawn } = await import("child_process");
  const { fileURLToPath } = await import("url");
  const { dirname, join, resolve } = await import("path");
  const { existsSync } = await import("fs");

  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Try compiled JS first, then fall back to tsx + source
  const compiledEntry = join(__dirname, "../../backend/dist/server.js");
  const sourceEntry = join(__dirname, "../../backend/src/server.ts");

  let child;
  if (existsSync(compiledEntry)) {
    child = spawn("node", [compiledEntry], { stdio: "inherit", env: { ...process.env } });
  } else if (existsSync(sourceEntry)) {
    const tsxBin = resolve(__dirname, "../../../node_modules/.bin/tsx");
    const tsxCmd = existsSync(tsxBin) ? tsxBin : "tsx";
    child = spawn(tsxCmd, [sourceEntry], { stdio: "inherit", env: { ...process.env } });
  } else {
    console.error(chalk.red("Could not find backend entry point."));
    console.error(chalk.dim("Try running: npm run build --workspace=packages/backend"));
    process.exit(1);
  }

  child.on("error", (err) => {
    console.error(chalk.red("Failed to start backend:"), err.message);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv;

  switch (cmd) {
    case "resume":
      await cmdResume();
      break;
    case "sessions":
      await cmdSessions();
      break;
    case "clear":
      await cmdClear();
      break;
    case "serve":
      await cmdServe();
      break;
    default:
      console.log();
      console.log(chalk.hex("#c8f135").bold("ctx") + chalk.dim(" — context saver"));
      console.log();
      console.log("  " + chalk.white("ctx resume") + chalk.dim("    — show what you were working on"));
      console.log("  " + chalk.white("ctx sessions") + chalk.dim("  — list recent sessions"));
      console.log("  " + chalk.white("ctx clear") + chalk.dim("     — clear all sessions"));
      console.log("  " + chalk.white("ctx serve") + chalk.dim("     — start the backend server"));
      console.log();
      if (cmd && cmd !== "--help" && cmd !== "-h") {
        console.log(chalk.red(`Unknown command: ${cmd}`));
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error(chalk.red("Error:"), err.message);
  process.exit(1);
});
