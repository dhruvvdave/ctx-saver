export interface TabData {
  url?: string;
  domain?: string;
  title?: string;
  timeSpent?: number;
  scrollDepth?: number;
  highlights?: string[];
  searchQuery?: string;
}

export interface SessionPayload {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tabs: Record<string, TabData>;
  blockedDomains?: string[];
  searchQueries?: string[];
  highlights?: Array<{ text: string; url?: string; title?: string; timestamp?: number }>;
}

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m}m`;
}

export function generateHeuristicSummary(session: SessionPayload): string {
  const tabs = Object.values(session.tabs).filter(
    (t): t is TabData & { domain: string } => !!t.domain
  );

  const domainTime: Record<string, number> = {};
  for (const tab of tabs) {
    domainTime[tab.domain] = (domainTime[tab.domain] || 0) + (tab.timeSpent || 0);
  }

  const topDomains = Object.entries(domainTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d);

  const queries = [
    ...(session.searchQueries || []),
    ...tabs.map((t) => t.searchQuery).filter(Boolean),
  ];
  const uniqueQueries = [...new Set(queries)].slice(0, 3);

  const topTab = tabs
    .filter((t) => t.title && t.timeSpent)
    .sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0))[0];

  const parts: string[] = [];

  if (topDomains.length > 0) {
    parts.push(`Active on: ${topDomains.join(", ")}`);
  }
  if (uniqueQueries.length > 0) {
    parts.push(`Searched: ${uniqueQueries.join("; ")}`);
  }
  if (topTab) {
    const title = topTab.title!.slice(0, 40);
    parts.push(`Most time on: ${title} (${formatMinutes(topTab.timeSpent || 0)})`);
  }

  return parts.join(" · ") || "Browsing session";
}

export async function generateSummaryWithOllama(session: SessionPayload): Promise<string> {
  const tabs = Object.values(session.tabs);
  const tabInfo = tabs
    .filter((t) => t.title && t.domain)
    .map((t) => `- ${t.title} (${t.domain}, ${formatMinutes(t.timeSpent || 0)})`)
    .join("\n");

  const queries = session.searchQueries?.join(", ") || "";
  const highlights = session.highlights?.map((h) => `"${h.text}"`).join(", ") || "";

  const prompt = `Based on the following browser session data, write a 1-2 sentence summary of what this person was working on. Be specific and concise.

Tabs visited:
${tabInfo}

Search queries: ${queries}
Highlighted text: ${highlights}

Summary:`;

  const model = process.env.CTX_OLLAMA_MODEL || "llama3.2";

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status}`);
  }

  const data = (await response.json()) as { response?: string };
  return (data.response || "").trim();
}
