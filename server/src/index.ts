import dotenv from "dotenv";
dotenv.config();

/**
 * AI Panel Studio -- Express Server Entry Point
 *
 * Responsibilities:
 *   - Express HTTP server (port 3001)
 *   - SQLite database via better-sqlite3
 *   - RESTful API (discussions, agents, transcript, consensus, summary)
 *   - SSE (Server-Sent Events) real-time push
 *   - Deepseek API integration for speech generation & summarisation
 *
 * All existing TDD services (guest-generation, speech-scheduler,
 * consensus-extractor) are consumed from their existing modules.
 */

import express, { type Request, type Response } from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

// ---- Existing services ----
import { generateLineup } from "./services/guest-generation/guest-generation.js";
import {
  determineNextSpeech,
  shouldEndDiscussion,
  type AgentBrief,
  type SpeechRecord,
  type SpeechType,
} from "./services/speech-scheduler/speech-scheduler.js";
import {
  extractConsensus,
  mergeConsensusResults,
  type SpeechRecord as ConsensusSpeechRecord,
} from "./services/consensus-extractor/consensus-extractor.js";

// ---- Schemas ----
import {
  type Agent,
  type AgentLineup,
  AgentLineupSchema,
} from "./schemas/agent.js";
import { type Message, MessageSchema } from "./schemas/message.js";
import {
  type ConsensusItem,
  ConsensusItemSchema,
} from "./schemas/consensus.js";

// =========================================================================
// Configuration
// =========================================================================

const PORT = Number(process.env.PORT) || 3001;
const DEEPSEEK_BASE =
  process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? "sk-placeholder";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const SPEECH_TIMEOUT_MS = 15_000;
const MAX_SPEECH_RETRIES = 2;
const SSE_HEARTBEAT_MS = 30_000;

// =========================================================================
// SQLite Database
// =========================================================================

const db = new Database(":memory:");

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// -------------------------------------------------------------------------
// Schema
// -------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS discussions (
    id            TEXT PRIMARY KEY,
    title         TEXT    NOT NULL,
    background    TEXT    NOT NULL DEFAULT '',
    status        TEXT    NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','ready','running','paused','completed','stopped')),
    max_rounds    INTEGER NOT NULL DEFAULT 3,
    current_round INTEGER NOT NULL DEFAULT 0,
    agent_count   INTEGER NOT NULL DEFAULT 0,
    speech_count  INTEGER NOT NULL DEFAULT 0,
    topic_focus   TEXT    NOT NULL DEFAULT '',
    template      TEXT             DEFAULT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agents (
    id             TEXT PRIMARY KEY,
    discussion_id  TEXT    NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    name           TEXT    NOT NULL,
    title          TEXT    NOT NULL,
    stance         TEXT    NOT NULL,
    color          TEXT    NOT NULL,
    is_host        INTEGER NOT NULL DEFAULT 0,
    sort_order     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id             TEXT PRIMARY KEY,
    discussion_id  TEXT    NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    agent_id       TEXT,
    agent_name     TEXT    NOT NULL,
    agent_role     TEXT    NOT NULL DEFAULT '',
    agent_color    TEXT    NOT NULL DEFAULT '#6B7280',
    round_number   INTEGER NOT NULL DEFAULT 1,
    type           TEXT    NOT NULL DEFAULT 'speech'
                          CHECK (type IN ('opening','speech','closing','system','thinking')),
    content        TEXT    NOT NULL DEFAULT '',
    is_streaming   INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS consensus_items (
    id                TEXT PRIMARY KEY,
    discussion_id     TEXT    NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    content           TEXT    NOT NULL,
    agreed_agent_ids  TEXT    NOT NULL DEFAULT '[]',
    disagreed_agent_ids TEXT   NOT NULL DEFAULT '[]',
    round_number      INTEGER NOT NULL DEFAULT 1,
    status            TEXT    NOT NULL DEFAULT 'proposed'
                              CHECK (status IN ('proposed','agreed','contested'))
  );

  CREATE TABLE IF NOT EXISTS summaries (
    id            TEXT PRIMARY KEY,
    discussion_id TEXT    NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    type          TEXT    NOT NULL DEFAULT 'final',
    round_number  INTEGER,
    content       TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agents_discussion ON agents(discussion_id);
  CREATE INDEX IF NOT EXISTS idx_messages_discussion ON messages(discussion_id);
  CREATE INDEX IF NOT EXISTS idx_consensus_discussion ON consensus_items(discussion_id);
  CREATE INDEX IF NOT EXISTS idx_summaries_discussion ON summaries(discussion_id);
`);

// =========================================================================
// Prepared Statements
// =========================================================================

const stmts = {
  // Discussions
  insertDiscussion: db.prepare(`
    INSERT INTO discussions (id, title, background, status, max_rounds, current_round, agent_count, speech_count, template)
    VALUES (@id, @title, @background, @status, @max_rounds, @current_round, @agent_count, @speech_count, @template)
  `),
  updateDiscussion: db.prepare(`
    UPDATE discussions
    SET status = @status, current_round = @current_round, speech_count = @speech_count,
        topic_focus = @topic_focus, updated_at = datetime('now')
    WHERE id = @id
  `),
  getDiscussion: db.prepare(`SELECT * FROM discussions WHERE id = ?`),
  listDiscussions: db.prepare(`
    SELECT * FROM discussions ORDER BY updated_at DESC
  `),
  listDiscussionsByStatus: db.prepare(`
    SELECT * FROM discussions WHERE status = ? ORDER BY updated_at DESC
  `),
  listDiscussionsBySearch: db.prepare(`
    SELECT * FROM discussions WHERE title LIKE ? OR background LIKE ? ORDER BY updated_at DESC
  `),

  // Agents
  insertAgent: db.prepare(`
    INSERT INTO agents (id, discussion_id, name, title, stance, color, is_host, sort_order)
    VALUES (@id, @discussion_id, @name, @title, @stance, @color, @is_host, @sort_order)
  `),
  getAgentsByDiscussion: db.prepare(
    `SELECT * FROM agents WHERE discussion_id = ? ORDER BY sort_order`
  ),
  deleteAgentsByDiscussion: db.prepare(
    `DELETE FROM agents WHERE discussion_id = ?`
  ),

  // Messages
  insertMessage: db.prepare(`
    INSERT INTO messages (id, discussion_id, agent_id, agent_name, agent_role, agent_color, round_number, type, content, is_streaming)
    VALUES (@id, @discussion_id, @agent_id, @agent_name, @agent_role, @agent_color, @round_number, @type, @content, @is_streaming)
  `),
  updateMessageContent: db.prepare(`
    UPDATE messages SET content = @content, is_streaming = @is_streaming WHERE id = @id
  `),
  getMessagesByDiscussion: db.prepare(
    `SELECT * FROM messages WHERE discussion_id = ? ORDER BY created_at`
  ),

  // Consensus
  insertConsensus: db.prepare(`
    INSERT INTO consensus_items (id, discussion_id, content, agreed_agent_ids, disagreed_agent_ids, round_number, status)
    VALUES (@id, @discussion_id, @content, @agreed_agent_ids, @disagreed_agent_ids, @round_number, @status)
  `),
  getConsensusByDiscussion: db.prepare(
    `SELECT * FROM consensus_items WHERE discussion_id = ? ORDER BY round_number, id`
  ),

  // Summary
  insertSummary: db.prepare(`
    INSERT INTO summaries (id, discussion_id, type, round_number, content)
    VALUES (@id, @discussion_id, @type, @round_number, @content)
  `),
  getSummariesByDiscussion: db.prepare(
    `SELECT * FROM summaries WHERE discussion_id = ? ORDER BY created_at DESC`
  ),
};

// =========================================================================
// SSE Connection Registry
// =========================================================================

/**
 * Active SSE connections keyed by discussionId.
 * Each discussion can have multiple connected clients.
 */
const sseClients = new Map<string, Set<Response>>();

/** Push a named SSE event to all clients watching a discussion. */
function broadcastSSE(discussionId: string, event: string, data: unknown): void {
  const clients = sseClients.get(discussionId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

/** Remove a client from the SSE registry. */
function removeSSEClient(discussionId: string, res: Response): void {
  const clients = sseClients.get(discussionId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) sseClients.delete(discussionId);
  }
}

// =========================================================================
// Deepseek API helper
// =========================================================================

async function callDeepseekChat(
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: string };
  } = {}
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPEECH_TIMEOUT_MS);

  try {
    const res = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: options.temperature ?? 0.8,
        max_tokens: options.max_tokens ?? 1024,
        response_format: options.response_format,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Deepseek API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// =========================================================================
// Speech generation
// =========================================================================

function buildSpeechPrompt(
  agentName: string,
  speechType: SpeechType,
  topic: string,
  agentStance: string,
  recentMessages: SpeechRecord[],
  roundNumber: number
): string {
  const recentContext =
    recentMessages.length > 0
      ? recentMessages
          .map(
            (m) =>
              `[${m.agentId === "host" ? "主持人" : "嘉宾"}]: ${m.content.slice(0, 120)}`
          )
          .join("\n")
      : "（尚无发言）";

  switch (speechType) {
    case "opening":
      return `你是讨论主持人。话题："${topic}"。
请发表开场白，介绍话题背景并邀请嘉宾发言。控制在 2-3 句话。`;

    case "closing":
      return `你是讨论主持人。话题："${topic}"。
讨论已进入尾声。请根据以下对话记录总结核心观点、已达成共识和仍存分歧，控制在 3-4 句话。

近期对话：
${recentContext}`;

    case "transition":
      return `你是讨论主持人。第 ${roundNumber - 1} 轮讨论已结束。
请用 1-2 句话总结上一轮，并引入第 ${roundNumber} 轮的讨论方向。`;

    case "speech":
    default:
      return `你是"${agentName}"，你的立场是"${agentStance}"。讨论话题："${topic}"。

近期对话：
${recentContext}

请针对其他嘉宾的观点进行回应，阐述你的立场。控制在 1-2 句话，直接、凝练。`;
  }
}

// =========================================================================
// Discussion Engine (orchestrator)
// =========================================================================

/**
 * Run the full discussion asynchronously.
 * This function is called after POST /api/discussions/:id/start
 * and drives the entire multi-round discussion via SSE events.
 */
async function runDiscussionEngine(discussionId: string): Promise<void> {
  const disc = stmts.getDiscussion.get(discussionId) as
    | Record<string, unknown>
    | undefined;
  if (!disc) return;

  const agentRows = stmts.getAgentsByDiscussion.all(discussionId) as Array<
    Record<string, unknown>
  >;

  const agents: AgentBrief[] = agentRows.map((a) => ({
    id: a.id as string,
    name: a.name as string,
    isHost: Boolean(a.is_host),
  }));

  const agentMap = new Map<string, Record<string, unknown>>();
  for (const a of agentRows) agentMap.set(a.id as string, a);

  const topic = disc.title as string;
  const maxRounds = disc.max_rounds as number;
  let currentRound = (disc.current_round as number) || 0;
  const history: SpeechRecord[] = [];

  // Load existing messages into history
  const existingMessages = stmts.getMessagesByDiscussion.all(discussionId) as Array<
    Record<string, unknown>
  >;
  for (const m of existingMessages) {
    history.push({
      agentId: (m.agent_id as string) ?? "",
      roundNumber: m.round_number as number,
      type: m.type as string,
      content: m.content as string,
    });
  }

  // Notify clients: discussion started
  broadcastSSE(discussionId, "status_change", { status: "running" });

  // Main loop
  let status: string = "running";

  while (status === "running") {
    const action = determineNextSpeech(agents, history, currentRound, maxRounds, status);

    if (!action.nextAgentId) break;

    currentRound = action.roundNumber;

    // Update DB state
    stmts.updateDiscussion.run({
      id: discussionId,
      status,
      current_round: currentRound,
      speech_count: history.length,
      topic_focus: `第${currentRound}轮`,
    });

    // Notify round change
    broadcastSSE(discussionId, "round_change", {
      round_number: currentRound,
      topic_focus: `第${currentRound}轮`,
    });

    // Get agent info
    const agentRow = agentMap.get(action.nextAgentId);
    if (!agentRow) break;

    const agentName = agentRow.name as string;
    const agentStance = (agentRow.stance as string) ?? "";
    const agentColor = (agentRow.color as string) ?? "#6B7280";
    const agentTitle = (agentRow.title as string) ?? "";

    const isHost = Boolean(agentRow.is_host);

    // Generate speech via Deepseek
    const speechPrompt = buildSpeechPrompt(
      agentName,
      action.speechType,
      topic,
      agentStance,
      history,
      currentRound
    );

    const msgId = uuid();

    // 1. Insert placeholder message (streaming)
    stmts.insertMessage.run({
      id: msgId,
      discussion_id: discussionId,
      agent_id: action.nextAgentId,
      agent_name: agentName,
      agent_role: agentTitle,
      agent_color: agentColor,
      round_number: currentRound,
      type: action.speechType,
      content: "",
      is_streaming: 1,
    });

    // Simulate streaming by sending partial content chunks
    let fullContent = "";

    try {
      // Retry loop for API calls
      let success = false;
      for (let attempt = 0; attempt <= MAX_SPEECH_RETRIES && !success; attempt++) {
        try {
          fullContent = await callDeepseekChat(
            [
              {
                role: "system",
                content:
                  "你是圆桌讨论的参与者。回复简洁、有观点。每次只输出 1-3 句话。",
              },
              { role: "user", content: speechPrompt },
            ],
            { temperature: 0.85, max_tokens: 512 }
          );
          success = true;
        } catch (err) {
          if (attempt === MAX_SPEECH_RETRIES) throw err;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    } catch (err) {
      console.error(`[speech] Generation failed for agent ${agentName}:`, String(err));
      fullContent = isHost
        ? "讨论继续。请各位嘉宾发表观点。"
        : `关于"${topic}"，我认为需要综合多方面因素进行考量。`;
    }

    // 2. Simulate streaming -- send incremental chunks
    const CHUNK_SIZE = 15;
    let sentChars = 0;
    while (sentChars < fullContent.length) {
      const chunk = fullContent.slice(0, sentChars + CHUNK_SIZE);
      sentChars = Math.min(sentChars + CHUNK_SIZE, fullContent.length);

      // Update DB
      stmts.updateMessageContent.run({
        id: msgId,
        content: chunk,
        is_streaming: sentChars < fullContent.length ? 1 : 0,
      });

      // Broadcast streaming message
      broadcastSSE(discussionId, "message", {
        id: msgId,
        agent_id: action.nextAgentId,
        agent_name: agentName,
        agent_role: agentTitle,
        agent_color: agentColor,
        round_number: currentRound,
        type: action.speechType,
        content: chunk,
        is_streaming: sentChars < fullContent.length,
      });

      // Small delay to simulate typing (scaled by chunk)
      await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    }

    // 3. Message complete
    stmts.updateMessageContent.run({
      id: msgId,
      content: fullContent,
      is_streaming: 0,
    });

    broadcastSSE(discussionId, "message_complete", {
      id: msgId,
      content: fullContent,
      is_streaming: false,
    });

    // 4. Add to history
    history.push({
      agentId: action.nextAgentId,
      roundNumber: currentRound,
      type: action.speechType,
      content: fullContent,
    });

    // Check if round is complete -> extract consensus
    const roundSpeeches = history.filter((s) => s.roundNumber === currentRound);
    const agentsInThisRound = new Set(roundSpeeches.map((s) => s.agentId));
    const nonHostAgents = agents.filter((a) => !a.isHost);
    const roundComplete = nonHostAgents.every((a) => agentsInThisRound.has(a.id));

    if (roundComplete && roundSpeeches.length >= 2) {
      // Extract consensus for this round
      const speechRecords: ConsensusSpeechRecord[] = roundSpeeches.map((s) => ({
        id: uuid(),
        agentId: s.agentId,
        agentName: agentMap.get(s.agentId)?.name as string ?? "",
        content: s.content,
        roundNumber: s.roundNumber,
      }));

      const existingConsensus = stmts.getConsensusByDiscussion.all(discussionId) as Array<
        Record<string, unknown>
      >;
      const existing: ConsensusItem[] = existingConsensus.map((c) => ({
        id: c.id as string,
        content: c.content as string,
        agreedAgentIds: JSON.parse(c.agreed_agent_ids as string) as string[],
        disagreedAgentIds: JSON.parse(c.disagreed_agent_ids as string) as string[],
        roundNumber: c.round_number as number,
        status: c.status as ConsensusItem["status"],
      }));

      // Only extract from guest speeches (skip host)
      const guestSpeeches = speechRecords.filter(
        (s) => !agentMap.get(s.agentId)?.is_host
      );
      const newConsensus = extractConsensus(guestSpeeches, existing, currentRound);
      const merged = mergeConsensusResults(existing, newConsensus);

      // Persist new items
      for (const item of merged) {
        if (!existing.some((e) => e.id === item.id)) {
          stmts.insertConsensus.run({
            id: item.id,
            discussion_id: discussionId,
            content: item.content,
            agreed_agent_ids: JSON.stringify(item.agreedAgentIds),
            disagreed_agent_ids: JSON.stringify(item.disagreedAgentIds),
            round_number: item.roundNumber,
            status: item.status,
          });
        }
      }

      // Broadcast consensus updates
      for (const item of merged) {
        if (!existing.some((e) => e.id === item.id)) {
          broadcastSSE(discussionId, "consensus_new", {
            id: item.id,
            content: item.content,
            agreed_agent_ids: item.agreedAgentIds,
            disagreed_agent_ids: item.disagreedAgentIds,
            round_number: item.roundNumber,
          });
        }
      }
    }

    // Check end condition
    if (shouldEndDiscussion(currentRound, maxRounds, history, status)) {
      status = "completed";
    }
  }

  // Generate final summary
  try {
    const allMessages = stmts.getMessagesByDiscussion.all(discussionId) as Array<
      Record<string, unknown>
    >;
    const consensusItems = stmts.getConsensusByDiscussion.all(discussionId) as Array<
      Record<string, unknown>
    >;

    const transcriptText = allMessages
      .map((m) => `[${m.agent_name}] (第${m.round_number}轮): ${m.content}`)
      .join("\n");

    const consensusText = consensusItems
      .map((c) => {
        const agreed = JSON.parse(c.agreed_agent_ids as string) as string[];
        const disagreed = JSON.parse(c.disagreed_agent_ids as string) as string[];
        return `- ${c.content} | 同意: ${agreed.length}人 | 反对: ${disagreed.length}人 | 状态: ${c.status}`;
      })
      .join("\n");

    const summaryPrompt = `请根据以下圆桌讨论记录生成中文总结报告。

话题：${topic}
总轮次：${maxRounds}

=== 对话记录 ===
${transcriptText.slice(0, 4000)}

=== 共识/分歧 ===
${consensusText || "暂无共识记录"}

请用以下 Markdown 格式输出：
## 讨论总结
### 核心观点
（列出每位嘉宾的核心立场）
### 已达成共识
（列出共识项）
### 仍存分歧
（列出有分歧的议题）
### 结论
（总体结论，2-3 句话）`;

    const summaryContent = await callDeepseekChat(
      [
        {
          role: "system",
          content:
            "你是专业的讨论总结助手。只返回 Markdown 格式的总结报告。",
        },
        { role: "user", content: summaryPrompt },
      ],
      { temperature: 0.5, max_tokens: 1500 }
    );

    if (summaryContent) {
      const summaryId = uuid();
      stmts.insertSummary.run({
        id: summaryId,
        discussion_id: discussionId,
        type: "final",
        round_number: null,
        content: summaryContent,
      });

      broadcastSSE(discussionId, "summary_new", {
        type: "final",
        content: summaryContent,
      });
    }
  } catch (err) {
    console.error("[summary] Generation failed:", String(err));
    // Fallback summary
    const fallback =
      `## 讨论总结\n\n围绕"${topic}"进行了 ${currentRound} 轮讨论，共 ${agents.length} 位专家参与。\n\n### 结论\n讨论已结束，感谢各位专家的参与。`;
    const summaryId = uuid();
    stmts.insertSummary.run({
      id: summaryId,
      discussion_id: discussionId,
      type: "final",
      round_number: null,
      content: fallback,
    });
    broadcastSSE(discussionId, "summary_new", {
      type: "final",
      content: fallback,
    });
  }

  // Finalise
  stmts.updateDiscussion.run({
    id: discussionId,
    status,
    current_round: currentRound,
    speech_count: history.length,
    topic_focus: "讨论结束",
  });

  broadcastSSE(discussionId, "status_change", { status });
}

// =========================================================================
// Helpers
// =========================================================================

/** Extract a string route parameter safely (Express 5 types have params as string | string[]). */
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Build a full discussion detail object. */
function buildDiscussionDetail(discussionId: string): Record<string, unknown> | null {
  const disc = stmts.getDiscussion.get(discussionId) as Record<string, unknown> | undefined;
  if (!disc) return null;

  const agents = stmts.getAgentsByDiscussion.all(discussionId);
  const messages = stmts.getMessagesByDiscussion.all(discussionId);
  const consensusItems = stmts.getConsensusByDiscussion.all(discussionId).map(
    (row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
        ...r,
        agreed_agent_ids: JSON.parse(r.agreed_agent_ids as string),
        disagreed_agent_ids: JSON.parse(r.disagreed_agent_ids as string),
      };
    }
  );
  const summaries = stmts.getSummariesByDiscussion.all(discussionId);

  return {
    ...disc,
    agents,
    messages,
    consensus_items: consensusItems,
    summaries,
  };
}

// =========================================================================
// Express Application
// =========================================================================

const app = express();

// ------- Middleware -------
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json({ limit: "256kb" }));

// =========================================================================
// REST API Routes
// =========================================================================

// -------------------------------------------------------------------------
// POST /api/discussions -- Create a new discussion
// -------------------------------------------------------------------------
app.post("/api/discussions", async (req: Request, res: Response) => {
  try {
    const {
      topic,
      guestCount = 4,
      background = "",
      template,
      maxRounds = 3,
    } = req.body as {
      topic?: string;
      guestCount?: number;
      background?: string;
      template?: string;
      maxRounds?: number;
    };

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      res.status(400).json({ error: "Topic is required" });
      return;
    }

    const count = Math.min(Math.max(guestCount, 2), 6);
    const rounds = Math.min(Math.max(maxRounds, 1), 5);
    const discussionId = uuid();

    // Generate lineup via existing service
    const lineup = await generateLineup({
      topic: topic.trim(),
      guestCount: count,
      background: background || "",
      template: template as "debate" | "roundtable" | "expert-panel" | undefined,
    });

    // Insert discussion
    stmts.insertDiscussion.run({
      id: discussionId,
      title: topic.trim(),
      background: background || "",
      status: "ready",
      max_rounds: rounds,
      current_round: 0,
      agent_count: count + 1, // host + guests
      speech_count: 0,
      template: template || null,
    });

    // Insert agents
    const allAgents = [lineup.host, ...lineup.guests];
    const insertAgent = stmts.insertAgent;
    for (const agent of allAgents) {
      insertAgent.run({
        id: agent.id,
        discussion_id: discussionId,
        name: agent.name,
        title: agent.title,
        stance: agent.stance,
        color: agent.color,
        is_host: agent.isHost ? 1 : 0,
        sort_order: agent.sortOrder,
      });
    }

    // Build response
    const detail = buildDiscussionDetail(discussionId);
    res.status(201).json(detail);
  } catch (err) {
    console.error("[POST /api/discussions]", err);
    res.status(500).json({ error: "Failed to create discussion" });
  }
});

// -------------------------------------------------------------------------
// GET /api/discussions -- List discussions
// -------------------------------------------------------------------------
app.get("/api/discussions", (req: Request, res: Response) => {
  try {
    const { status, search, page = "1", limit = "20" } = req.query as {
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    let rows: unknown[];

    if (search && search.trim()) {
      const pattern = `%${search.trim()}%`;
      rows = stmts.listDiscussionsBySearch.all(pattern, pattern);
    } else if (status && status !== "all") {
      rows = stmts.listDiscussionsByStatus.all(status);
    } else {
      rows = stmts.listDiscussions.all();
    }

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const total = rows.length;
    const start = (pageNum - 1) * limitNum;
    const paged = rows.slice(start, start + limitNum);

    res.json({
      data: paged,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error("[GET /api/discussions]", err);
    res.status(500).json({ error: "Failed to list discussions" });
  }
});

// -------------------------------------------------------------------------
// GET /api/discussions/:id -- Get discussion detail
// -------------------------------------------------------------------------
app.get("/api/discussions/:id", (req: Request, res: Response) => {
  try {
    const detail = buildDiscussionDetail(param(req, "id"));
    if (!detail) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }
    res.json(detail);
  } catch (err) {
    console.error("[GET /api/discussions/:id]", err);
    res.status(500).json({ error: "Failed to fetch discussion" });
  }
});

// -------------------------------------------------------------------------
// DELETE /api/discussions/:id -- Delete a discussion
// -------------------------------------------------------------------------
app.delete("/api/discussions/:id", (req: Request, res: Response) => {
  try {
    const disc = stmts.getDiscussion.get(param(req, "id"));
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }
    db.prepare("DELETE FROM discussions WHERE id = ?").run(param(req, "id"));
    // Close any active SSE connections for this discussion
    const clients = sseClients.get(param(req, "id"));
    if (clients) {
      for (const client of clients) client.end();
      sseClients.delete(param(req, "id"));
    }
    res.json({ message: "Discussion deleted" });
  } catch (err) {
    console.error("[DELETE /api/discussions/:id]", err);
    res.status(500).json({ error: "Failed to delete discussion" });
  }
});

// -------------------------------------------------------------------------
// POST /api/discussions/:id/agents -- Configure agent lineup
// (Idempotent -- replaces existing agents for the discussion)
// -------------------------------------------------------------------------
app.post("/api/discussions/:id/agents", async (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const body = req.body as { agents?: Agent[] };

    if (body.agents && Array.isArray(body.agents)) {
      // Manual agent assignment
      stmts.deleteAgentsByDiscussion.run(discussionId);
      for (const agent of body.agents) {
        stmts.insertAgent.run({
          id: agent.id || uuid(),
          discussion_id: discussionId,
          name: agent.name,
          title: agent.title,
          stance: agent.stance,
          color: agent.color,
          is_host: agent.isHost ? 1 : 0,
          sort_order: agent.sortOrder ?? 0,
        });
      }
      stmts.updateDiscussion.run({
        id: discussionId,
        status: "ready",
        current_round: 0,
        speech_count: 0,
        topic_focus: "",
      });
    } else {
      // Re-generate from discussion topic
      const discRow = disc as Record<string, unknown>;
      const lineup = await generateLineup({
        topic: discRow.title as string,
        guestCount: (discRow.agent_count as number) - 1 || 4,
        background: (discRow.background as string) || "",
      });
      stmts.deleteAgentsByDiscussion.run(discussionId);
      for (const agent of [lineup.host, ...lineup.guests]) {
        stmts.insertAgent.run({
          id: agent.id,
          discussion_id: discussionId,
          name: agent.name,
          title: agent.title,
          stance: agent.stance,
          color: agent.color,
          is_host: agent.isHost ? 1 : 0,
          sort_order: agent.sortOrder,
        });
      }
      stmts.updateDiscussion.run({
        id: discussionId,
        status: "ready",
        current_round: 0,
        speech_count: 0,
        topic_focus: "",
      });
    }

    const detail = buildDiscussionDetail(discussionId);
    res.json(detail);
  } catch (err) {
    console.error("[POST /api/discussions/:id/agents]", err);
    res.status(500).json({ error: "Failed to configure agents" });
  }
});

// -------------------------------------------------------------------------
// POST /api/discussions/:id/start -- Start the discussion
// -------------------------------------------------------------------------
app.post("/api/discussions/:id/start", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const discRow = disc as Record<string, unknown>;
    if (discRow.status === "running") {
      res.json({
        message: "Discussion already running",
        status: "running",
        current_round: discRow.current_round,
      });
      return;
    }

    // Check agents exist
    const agentCount = (
      db.prepare("SELECT COUNT(*) as count FROM agents WHERE discussion_id = ?").get(discussionId) as
        { count: number }
    ).count;

    if (agentCount < 3) {
      res.status(400).json({
        error: "Discussion needs at least 1 host + 2 guests",
      });
      return;
    }

    // Update status
    stmts.updateDiscussion.run({
      id: discussionId,
      status: "running",
      current_round: 1,
      speech_count: 0,
      topic_focus: "第1轮",
    });

    // Respond immediately
    res.json({
      message: "Discussion started",
      status: "running",
      current_round: 1,
    });

    // Kick off the async discussion engine (don't await -- runs in background)
    runDiscussionEngine(discussionId).catch((err) => {
      console.error("[engine] Discussion engine error:", err);
      // Set status to stopped on unrecoverable error
      stmts.updateDiscussion.run({
        id: discussionId,
        status: "stopped",
        current_round: discRow.current_round,
        speech_count: discRow.speech_count,
        topic_focus: "",
      });
      broadcastSSE(discussionId, "status_change", { status: "stopped" });
      broadcastSSE(discussionId, "error", {
        code: "ENGINE_ERROR",
        message: "Discussion engine encountered an error and was stopped",
      });
    });
  } catch (err) {
    console.error("[POST /api/discussions/:id/start]", err);
    res.status(500).json({ error: "Failed to start discussion" });
  }
});

// -------------------------------------------------------------------------
// POST /api/discussions/:id/pause -- Pause the discussion
// -------------------------------------------------------------------------
app.post("/api/discussions/:id/pause", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    stmts.updateDiscussion.run({
      id: discussionId,
      status: "paused",
      current_round: (disc as Record<string, unknown>).current_round,
      speech_count: (disc as Record<string, unknown>).speech_count,
      topic_focus: "",
    });

    broadcastSSE(discussionId, "status_change", { status: "paused" });

    res.json({ message: "Discussion paused", status: "paused" });
  } catch (err) {
    console.error("[POST /api/discussions/:id/pause]", err);
    res.status(500).json({ error: "Failed to pause discussion" });
  }
});

// -------------------------------------------------------------------------
// POST /api/discussions/:id/resume -- Resume the discussion
// -------------------------------------------------------------------------
app.post("/api/discussions/:id/resume", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const discRow = disc as Record<string, unknown>;

    stmts.updateDiscussion.run({
      id: discussionId,
      status: "running",
      current_round: discRow.current_round,
      speech_count: discRow.speech_count,
      topic_focus: `第${discRow.current_round}轮`,
    });

    broadcastSSE(discussionId, "status_change", { status: "running" });

    res.json({ message: "Discussion resumed", status: "running" });

    // Restart engine
    runDiscussionEngine(discussionId).catch((err) => {
      console.error("[engine] Resume engine error:", err);
    });
  } catch (err) {
    console.error("[POST /api/discussions/:id/resume]", err);
    res.status(500).json({ error: "Failed to resume discussion" });
  }
});

// -------------------------------------------------------------------------
// POST /api/discussions/:id/stop -- Stop the discussion
// -------------------------------------------------------------------------
app.post("/api/discussions/:id/stop", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const discRow = disc as Record<string, unknown>;

    stmts.updateDiscussion.run({
      id: discussionId,
      status: "stopped",
      current_round: discRow.current_round,
      speech_count: discRow.speech_count,
      topic_focus: "",
    });

    broadcastSSE(discussionId, "status_change", { status: "stopped" });

    res.json({ message: "Discussion stopped", status: "stopped" });
  } catch (err) {
    console.error("[POST /api/discussions/:id/stop]", err);
    res.status(500).json({ error: "Failed to stop discussion" });
  }
});

// -------------------------------------------------------------------------
// POST /api/discussions/:id/next-round -- Advance to next round
// -------------------------------------------------------------------------
app.post("/api/discussions/:id/next-round", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const discRow = disc as Record<string, unknown>;
    const nextRound = Math.min(
      (discRow.current_round as number) + 1,
      discRow.max_rounds as number
    );

    stmts.updateDiscussion.run({
      id: discussionId,
      status: "running",
      current_round: nextRound,
      speech_count: discRow.speech_count,
      topic_focus: `第${nextRound}轮`,
    });

    broadcastSSE(discussionId, "round_change", {
      round_number: nextRound,
      topic_focus: `第${nextRound}轮`,
    });

    res.json({
      message: "Advanced to next round",
      status: "running",
      current_round: nextRound,
    });
  } catch (err) {
    console.error("[POST /api/discussions/:id/next-round]", err);
    res.status(500).json({ error: "Failed to advance round" });
  }
});

// -------------------------------------------------------------------------
// GET /api/discussions/:id/events -- SSE real-time event stream
// -------------------------------------------------------------------------
app.get("/api/discussions/:id/events", (req: Request, res: Response) => {
  const discussionId = param(req, "id");

  // Verify discussion exists
  const disc = stmts.getDiscussion.get(discussionId);
  if (!disc) {
    res.status(404).json({ error: "Discussion not found" });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
    "Access-Control-Allow-Origin": CORS_ORIGIN,
  });

  // Send initial connection event
  res.write(
    `event: connected\ndata: ${JSON.stringify({ discussion_id: discussionId })}\n\n`
  );

  // Register client
  if (!sseClients.has(discussionId)) {
    sseClients.set(discussionId, new Set());
  }
  sseClients.get(discussionId)!.add(res);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      removeSSEClient(discussionId, res);
    }
  }, SSE_HEARTBEAT_MS);

  // Clean up on close
  req.on("close", () => {
    clearInterval(heartbeat);
    removeSSEClient(discussionId, res);
  });
});

// -------------------------------------------------------------------------
// GET /api/discussions/:id/transcript -- Get transcript messages
// -------------------------------------------------------------------------
app.get("/api/discussions/:id/transcript", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const messages = stmts.getMessagesByDiscussion.all(discussionId);
    res.json({ data: messages, total: messages.length });
  } catch (err) {
    console.error("[GET /api/discussions/:id/transcript]", err);
    res.status(500).json({ error: "Failed to fetch transcript" });
  }
});

// -------------------------------------------------------------------------
// GET /api/discussions/:id/messages -- Alias for transcript
// -------------------------------------------------------------------------
app.get("/api/discussions/:id/messages", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const messages = stmts.getMessagesByDiscussion.all(discussionId);
    res.json({ data: messages, total: messages.length });
  } catch (err) {
    console.error("[GET /api/discussions/:id/messages]", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// -------------------------------------------------------------------------
// GET /api/discussions/:id/consensus -- Get consensus items
// -------------------------------------------------------------------------
app.get("/api/discussions/:id/consensus", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const items = stmts.getConsensusByDiscussion.all(discussionId).map(
      (row: unknown) => {
        const r = row as Record<string, unknown>;
        return {
          ...r,
          agreed_agent_ids: JSON.parse(r.agreed_agent_ids as string),
          disagreed_agent_ids: JSON.parse(r.disagreed_agent_ids as string),
        };
      }
    );

    res.json({ data: items, total: items.length });
  } catch (err) {
    console.error("[GET /api/discussions/:id/consensus]", err);
    res.status(500).json({ error: "Failed to fetch consensus" });
  }
});

// -------------------------------------------------------------------------
// POST /api/discussions/:id/summarize -- Generate a summary
// -------------------------------------------------------------------------
app.post("/api/discussions/:id/summarize", async (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const discRow = disc as Record<string, unknown>;
    const messages = stmts.getMessagesByDiscussion.all(discussionId) as Array<
      Record<string, unknown>
    >;
    const consensusItems = stmts.getConsensusByDiscussion.all(discussionId) as Array<
      Record<string, unknown>
    >;

    if (messages.length === 0) {
      res.status(400).json({ error: "No transcript to summarize" });
      return;
    }

    const transcriptText = messages
      .map((m) => `[${m.agent_name}] (第${m.round_number}轮): ${m.content}`)
      .join("\n");

    const consensusText = consensusItems
      .map((c) => {
        const agreed = JSON.parse(c.agreed_agent_ids as string) as string[];
        const disagreed = JSON.parse(c.disagreed_agent_ids as string) as string[];
        return `- ${c.content} | 同意: ${agreed.length}人 | 反对: ${disagreed.length}人`;
      })
      .join("\n");

    const summaryPrompt = `请根据以下圆桌讨论记录生成中文总结。

话题：${discRow.title}
总轮次：${discRow.max_rounds}

=== 对话记录 ===
${transcriptText.slice(0, 4000)}

=== 共识/分歧 ===
${consensusText || "暂无记录"}

请用 Markdown 格式输出：
## 讨论总结
### 核心观点
### 已达成共识
### 仍存分歧
### 结论`;

    const summaryContent = await callDeepseekChat(
      [
        {
          role: "system",
          content:
            "你是专业的讨论总结助手。只返回 Markdown 格式的总结报告。",
        },
        { role: "user", content: summaryPrompt },
      ],
      { temperature: 0.5, max_tokens: 1500 }
    );

    const summaryId = uuid();
    stmts.insertSummary.run({
      id: summaryId,
      discussion_id: discussionId,
      type: "final",
      round_number: null,
      content: summaryContent,
    });

    broadcastSSE(discussionId, "summary_new", {
      type: "final",
      content: summaryContent,
    });

    res.status(201).json({
      id: summaryId,
      type: "final",
      content: summaryContent,
    });
  } catch (err) {
    console.error("[POST /api/discussions/:id/summarize]", err);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// -------------------------------------------------------------------------
// GET /api/discussions/:id/summaries -- Get summaries for a discussion
// -------------------------------------------------------------------------
app.get("/api/discussions/:id/summaries", (req: Request, res: Response) => {
  try {
    const discussionId = param(req, "id");
    const disc = stmts.getDiscussion.get(discussionId);
    if (!disc) {
      res.status(404).json({ error: "Discussion not found" });
      return;
    }

    const summaries = stmts.getSummariesByDiscussion.all(discussionId);
    res.json({ data: summaries, total: summaries.length });
  } catch (err) {
    console.error("[GET /api/discussions/:id/summaries]", err);
    res.status(500).json({ error: "Failed to fetch summaries" });
  }
});

// -------------------------------------------------------------------------
// GET /api/agent-templates -- List preset agent templates
// -------------------------------------------------------------------------
app.get("/api/agent-templates", (_req: Request, res: Response) => {
  res.json({
    data: [
      { id: "tpl-1", name: "理性分析师", role: "分析师", avatar: "analyst", is_preset: true },
      { id: "tpl-2", name: "科技法律顾问", role: "法律顾问", avatar: "law", is_preset: true },
      { id: "tpl-3", name: "社会学家", role: "学者", avatar: "scholar", is_preset: true },
      { id: "tpl-4", name: "企业家", role: "企业家", avatar: "ceo", is_preset: true },
      { id: "tpl-5", name: "政策分析师", role: "分析师", avatar: "policy", is_preset: true },
      { id: "tpl-6", name: "主持人", role: "主持人", avatar: "host", is_preset: true },
    ],
  });
});

// -------------------------------------------------------------------------
// POST /api/discussions/generate-lineup -- Generate lineup (standalone)
// -------------------------------------------------------------------------
app.post("/api/discussions/generate-lineup", async (req: Request, res: Response) => {
  try {
    const { topic, guestCount = 4, background, template } = req.body as {
      topic?: string;
      guestCount?: number;
      background?: string;
      template?: string;
    };

    if (!topic) {
      res.status(400).json({ error: "Topic is required" });
      return;
    }

    const lineup = await generateLineup({
      topic,
      guestCount: Math.min(Math.max(guestCount, 2), 6),
      background: background || "",
      template: template as "debate" | "roundtable" | "expert-panel" | undefined,
    });

    res.json(lineup);
  } catch (err) {
    console.error("[POST /api/discussions/generate-lineup]", err);
    res.status(500).json({ error: "Failed to generate lineup" });
  }
});

// -------------------------------------------------------------------------
// Health check
// -------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    sseClients: [...sseClients.entries()].reduce(
      (acc, [id, clients]) => {
        acc[id] = clients.size;
        return acc;
      },
      {} as Record<string, number>
    ),
  });
});

// =========================================================================
// Start Server
// =========================================================================

app.listen(PORT, () => {
  console.log(`[server] AI Panel Studio API running on http://localhost:${PORT}`);
  console.log(`[server] CORS origin: ${CORS_ORIGIN}`);
  console.log(`[server] SSE heartbeat: ${SSE_HEARTBEAT_MS / 1000}s`);
});
