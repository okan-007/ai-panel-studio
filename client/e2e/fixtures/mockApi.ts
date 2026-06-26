/**
 * mockApi.ts
 *
 * Sets up Playwright page.route() interceptors for all backend REST endpoints.
 * Each route handler returns realistic mock data defined in mockData.ts.
 *
 * Usage in a test:
 *   await setupMockApi(page, { discussionListCount: 3 });
 */

import type { Page, Route } from "@playwright/test";
import {
  createMockDiscussion,
  createMockDiscussionList,
  createMockLineup,
  createMockTranscript,
  createMockConsensus,
  createMockFinalSummary,
  type MockDiscussion,
  type MockAgent,
} from "./mockData.js";

// ---------------------------------------------------------------------------
// In-memory store per test
// ---------------------------------------------------------------------------

interface TestStore {
  discussions: MockDiscussion[];
  lineups: Map<string, { host: MockAgent; guests: MockAgent[] }>;
  transcripts: Map<string, ReturnType<typeof createMockTranscript>>;
  consensus: Map<string, ReturnType<typeof createMockConsensus>>;
}

// ---------------------------------------------------------------------------
// Route handler factory
// ---------------------------------------------------------------------------

function jsonResponse(route: Route, body: unknown, status = 200) {
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function errorResponse(route: Route, message: string, status = 500) {
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ error: message }),
  });
}

// ---------------------------------------------------------------------------
// Setup function
// ---------------------------------------------------------------------------

export interface SetupOptions {
  /** Number of discussions in the list */
  discussionListCount?: number;
  /** Simulate API errors for specific endpoints ("create" | "lineup" | "start" | "sse" | "none") */
  simulateError?: "create" | "lineup" | "start" | "sse" | "none";
  /** Delay before response (ms) — simulates network latency */
  responseDelay?: number;
}

export async function setupMockApi(page: Page, options: SetupOptions = {}) {
  const {
    discussionListCount = 3,
    simulateError = "none",
    responseDelay = 50,
  } = options;

  const store: TestStore = {
    discussions: createMockDiscussionList(discussionListCount),
    lineups: new Map(),
    transcripts: new Map(),
    consensus: new Map(),
  };

  // Helper: delay if configured
  async function maybeDelay() {
    if (responseDelay > 0) await new Promise((r) => setTimeout(r, responseDelay));
  }

  // -------------------------------------------------------------------
  // GET /api/discussions — list
  // -------------------------------------------------------------------
  await page.route("**/api/discussions?*", async (route) => {
    await maybeDelay();
    jsonResponse(route, {
      data: store.discussions,
      total: store.discussions.length,
      page: 1,
      limit: 20,
    });
  });

  await page.route("**/api/discussions", async (route) => {
    if (route.request().method() === "GET") {
      await maybeDelay();
      jsonResponse(route, {
        data: store.discussions,
        total: store.discussions.length,
        page: 1,
        limit: 20,
      });
      return;
    }

    if (route.request().method() === "POST") {
      await maybeDelay();

      if (simulateError === "create") {
        errorResponse(route, "Internal Server Error", 500);
        return;
      }

      const body = route.request().postDataJSON() ?? {};
      const newDiscussion = createMockDiscussion({
        id: `disc-${Date.now()}`,
        title: body.topic ?? "未命名讨论",
        background: body.background ?? "",
        agentCount: body.guestCount ?? 4,
      });

      store.discussions.unshift(newDiscussion);

      // Also pre-generate lineage for this discussion
      const lineup = createMockLineup(body.topic ?? "未命名讨论", body.guestCount ?? 4);
      store.lineups.set(newDiscussion.id, lineup);

      jsonResponse(route, {
        ...newDiscussion,
        agents: [lineup.host, ...lineup.guests],
      }, 201);
    }
  });

  // -------------------------------------------------------------------
  // GET /api/discussions/:id — detail
  // -------------------------------------------------------------------
  await page.route(/\/api\/discussions\/disc-\d+$/, async (route) => {
    await maybeDelay();
    const url = route.request().url();
    const id = url.split("/").pop()!;
    const discussion = store.discussions.find((d) => d.id === id);

    if (!discussion) {
      errorResponse(route, "Discussion not found", 404);
      return;
    }

    const lineup = store.lineups.get(id);
    const transcript = store.transcripts.get(id);
    const consensus = store.consensus.get(id);

    jsonResponse(route, {
      ...discussion,
      agents: lineup ? [lineup.host, ...lineup.guests] : [],
      messages: transcript ?? [],
      consensus_items: consensus ?? [],
    });
  });

  // -------------------------------------------------------------------
  // DELETE /api/discussions/:id
  // -------------------------------------------------------------------
  await page.route(/\/api\/discussions\/disc-\d+$/, async (route) => {
    if (route.request().method() === "DELETE") {
      await maybeDelay();
      const url = route.request().url();
      const id = url.split("/").pop()!;
      store.discussions = store.discussions.filter((d) => d.id !== id);
      store.lineups.delete(id);
      store.transcripts.delete(id);
      store.consensus.delete(id);
      jsonResponse(route, { message: "Discussion deleted" });
    }
  });

  // -------------------------------------------------------------------
  // POST /api/discussions/:id/generate-lineup
  // -------------------------------------------------------------------
  await page.route(/\/api\/discussions\/generate-lineup$/, async (route) => {
    await maybeDelay();

    if (simulateError === "lineup") {
      errorResponse(route, "AI lineup generation failed", 500);
      return;
    }

    const body = route.request().postDataJSON() ?? {};
    const lineup = createMockLineup(body.topic ?? "", body.guestCount ?? 4);

    jsonResponse(route, lineup);
  });

  // -------------------------------------------------------------------
  // POST /api/discussions/:id/start
  // -------------------------------------------------------------------
  await page.route(/\/api\/discussions\/disc-\d+\/start$/, async (route) => {
    await maybeDelay();

    if (simulateError === "start") {
      errorResponse(route, "Failed to start discussion", 500);
      return;
    }

    const url = route.request().url();
    const id = url.match(/disc-\d+/)![0];
    const discussion = store.discussions.find((d) => d.id === id);

    if (discussion) {
      discussion.status = "running";
      discussion.currentRound = 1;
    }

    // Pre-populate transcript for history view
    const lineup = store.lineups.get(id);
    if (lineup && !store.transcripts.has(id)) {
      store.transcripts.set(id, createMockTranscript(id, [lineup.host, ...lineup.guests]));
      store.consensus.set(id, createMockConsensus([lineup.host, ...lineup.guests]));
    }

    jsonResponse(route, { message: "Discussion started", status: "running", current_round: 1 });
  });

  // -------------------------------------------------------------------
  // POST /api/discussions/:id/pause | resume | stop | next-round
  // -------------------------------------------------------------------
  for (const action of ["pause", "resume", "stop", "next-round"]) {
    await page.route(`**/api/discussions/disc-*/${action}`, async (route) => {
      await maybeDelay();
      const url = route.request().url();
      const id = url.match(/disc-\d+/)![0];
      const discussion = store.discussions.find((d) => d.id === id);

      const statusMap: Record<string, string> = {
        pause: "paused",
        resume: "running",
        stop: "stopped",
        "next-round": "running",
      };

      if (discussion) {
        discussion.status = statusMap[action] as MockDiscussion["status"];
      }

      jsonResponse(route, {
        message: `Discussion ${action}ed`,
        status: statusMap[action],
        ...(action === "next-round" ? { current_round: (discussion?.currentRound ?? 0) + 1 } : {}),
      });
    });
  }

  // -------------------------------------------------------------------
  // GET /api/discussions/:id/messages
  // -------------------------------------------------------------------
  await page.route(/\/api\/discussions\/disc-\d+\/messages/, async (route) => {
    await maybeDelay();
    const url = route.request().url();
    const id = url.match(/disc-\d+/)![0];
    const transcript = store.transcripts.get(id) ?? [];

    jsonResponse(route, { data: transcript });
  });

  // -------------------------------------------------------------------
  // GET /api/discussions/:id/consensus
  // -------------------------------------------------------------------
  await page.route(/\/api\/discussions\/disc-\d+\/consensus$/, async (route) => {
    await maybeDelay();
    const url = route.request().url();
    const id = url.match(/disc-\d+/)![0];
    const consensus = store.consensus.get(id) ?? [];

    jsonResponse(route, { data: consensus });
  });

  // -------------------------------------------------------------------
  // GET /api/discussions/:id/summaries
  // -------------------------------------------------------------------
  await page.route(/\/api\/discussions\/disc-\d+\/summaries$/, async (route) => {
    await maybeDelay();
    jsonResponse(route, {
      data: [
        { id: "sum-001", type: "final", round_number: null, content: createMockFinalSummary() },
      ],
    });
  });

  // -------------------------------------------------------------------
  // GET /api/agent-templates
  // -------------------------------------------------------------------
  await page.route("**/api/agent-templates", async (route) => {
    await maybeDelay();
    jsonResponse(route, {
      data: [
        { id: "tpl-1", name: "理性分析师", role: "分析师", avatar: "analyst", is_preset: true },
        { id: "tpl-2", name: "科技法律顾问", role: "法律顾问", avatar: "law", is_preset: true },
        { id: "tpl-3", name: "社会学家", role: "学者", avatar: "scholar", is_preset: true },
      ],
    });
  });

  // Return store for test assertions & SSE simulation
  return store;
}
