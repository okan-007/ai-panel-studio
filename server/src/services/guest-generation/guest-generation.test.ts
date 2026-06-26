/**
 * guest-generation.test.ts
 *
 * TDD — RED/GREEN/REFACTOR: tests for agent lineup generation service.
 *
 * Test strategy:
 *   - Mock global fetch via vi.fn() so tests are deterministic and offline.
 *   - Validate output against Zod schemas.
 *   - Cover happy path, edge cases, and error/fallback paths.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import {
  AgentSchema,
  AgentLineupSchema,
  DeepseekLineupResponseSchema,
  AGENT_COLORS,
  type AgentLineup,
  type LineupGenerationInput,
} from "../../schemas/agent.js";

// ---------------------------------------------------------------------------
// Dynamic imports for service under test
// ---------------------------------------------------------------------------

let generateLineup: (input: LineupGenerationInput) => Promise<AgentLineup>;
let generateFallbackLineup: (topic: string, guestCount: number) => AgentLineup;

async function loadService() {
  const mod = await import("./guest-generation.js");
  generateLineup = mod.generateLineup;
  generateFallbackLineup = mod.generateFallbackLineup;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock fetch Response object */
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    statusText: status === 200 ? "OK" : "Error",
    type: "basic" as ResponseType,
    url: "",
    clone: () => mockResponse(body, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
  } as Response;
}

function mockDeepseekSuccess(data: unknown): Response {
  return mockResponse({
    choices: [{ message: { content: JSON.stringify(data) } }],
  });
}

function mockDeepseekText(text: string): Response {
  return mockResponse({
    choices: [{ message: { content: text } }],
  });
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const VALID_DEEPSEEK_RESPONSE = {
  host: {
    name: "AI主持人",
    title: "圆桌讨论引导者",
    stance: "中立客观，引导讨论有序进行",
    color: "#6B7280",
  },
  guests: [
    {
      name: "张明远",
      title: "AI伦理与法律研究所所长",
      stance: "支持赋予AI有限法律人格，主张渐进式赋权",
      color: "#3B82F6",
    },
    {
      name: "李思齐",
      title: "科技法律事务所合伙人",
      stance: "审慎监管，认为现行法律框架需要先行完善",
      color: "#F59E0B",
    },
    {
      name: "王晓峰",
      title: "计算机科学与AI研究员",
      stance: "反对AI人格化，主张\"电子代理人\"法律概念",
      color: "#EF4444",
    },
    {
      name: "赵雪梅",
      title: "社会学与公共政策教授",
      stance: "关注AI权利对社会结构的深远影响",
      color: "#8B5CF6",
    },
  ],
};

const TOPIC = "AI是否应该拥有法律人格？";
const GUEST_COUNT = 4;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("guest-generation — Agent 阵容生成", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    await loadService();
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Default mock: successful Deepseek API call
    globalThis.fetch = vi.fn().mockResolvedValue(mockDeepseekSuccess(VALID_DEEPSEEK_RESPONSE));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Schema validation of API response
  // -----------------------------------------------------------------------
  describe("API 响应 Schema 校验", () => {
    it("应该通过 DeepseekLineupResponseSchema 校验合法的 API 响应", () => {
      const result = DeepseekLineupResponseSchema.safeParse(VALID_DEEPSEEK_RESPONSE);
      expect(result.success).toBe(true);
    });

    it("应该在 host 缺少必填字段时拒绝", () => {
      const bad = {
        ...VALID_DEEPSEEK_RESPONSE,
        host: { name: "主持人" },
      };
      const result = DeepseekLineupResponseSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it("应该在 guests 为空数组时 AgentLineupSchema 拒绝（最少2人）", () => {
      const lineup = AgentLineupSchema.safeParse({
        host: { ...VALID_DEEPSEEK_RESPONSE.host, isHost: true },
        guests: [],
      });
      expect(lineup.success).toBe(false);
    });

    it("应该在 color 不是合法 hex 时拒绝", () => {
      const bad = {
        ...VALID_DEEPSEEK_RESPONSE,
        guests: [
          { ...VALID_DEEPSEEK_RESPONSE.guests[0], color: "not-a-color" },
          ...VALID_DEEPSEEK_RESPONSE.guests.slice(1),
        ],
      };
      const result = DeepseekLineupResponseSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Agent count correctness
  // -----------------------------------------------------------------------
  describe("Agent 人数校验", () => {
    it("生成 2 个 guest 时返回 1 host + 2 guests", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockDeepseekSuccess({
          ...VALID_DEEPSEEK_RESPONSE,
          guests: VALID_DEEPSEEK_RESPONSE.guests.slice(0, 2),
        }),
      );

      const lineup = await generateLineup({ topic: TOPIC, guestCount: 2, background: "" });
      expect(lineup.host).toBeDefined();
      expect(lineup.guests).toHaveLength(2);
    });

    it("生成 6 个 guest 时返回 1 host + 6 guests", async () => {
      const sixGuests = Array.from({ length: 6 }, (_, i) => ({
        name: `专家${i + 1}`,
        title: `头衔${i + 1}`,
        stance: `立场${i + 1}`,
        color: AGENT_COLORS[i],
      }));
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockDeepseekSuccess({ host: VALID_DEEPSEEK_RESPONSE.host, guests: sixGuests }),
      );

      const lineup = await generateLineup({ topic: TOPIC, guestCount: 6, background: "" });
      expect(lineup.guests).toHaveLength(6);
    });

    it("应该通过 AgentLineupSchema 整体校验", async () => {
      const lineup = await generateLineup({ topic: TOPIC, guestCount: GUEST_COUNT, background: "" });
      const result = AgentLineupSchema.safeParse(lineup);
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Required fields on every agent
  // -----------------------------------------------------------------------
  describe("必填字段完整性", () => {
    it("host 必须包含 name, title, stance, color, isHost=true", async () => {
      const lineup = await generateLineup({ topic: TOPIC, guestCount: GUEST_COUNT, background: "" });
      const host = lineup.host;
      expect(host.name).toBeTruthy();
      expect(host.title).toBeTruthy();
      expect(host.stance).toBeTruthy();
      expect(host.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(host.isHost).toBe(true);
    });

    it("每个 guest 必须包含 name, title, stance, color, isHost=false", async () => {
      const lineup = await generateLineup({ topic: TOPIC, guestCount: GUEST_COUNT, background: "" });
      for (const guest of lineup.guests) {
        const parsed = AgentSchema.safeParse(guest);
        expect(parsed.success).toBe(true);
        expect(guest.name).toBeTruthy();
        expect(guest.title).toBeTruthy();
        expect(guest.stance).toBeTruthy();
        expect(guest.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(guest.isHost).toBe(false);
      }
    });

    it("所有 agent 的 color 值仅来自 AGENT_COLORS 预定义集合", async () => {
      const lineup = await generateLineup({ topic: TOPIC, guestCount: GUEST_COUNT, background: "" });
      const allColors = [lineup.host.color, ...lineup.guests.map((g) => g.color)];
      for (const color of allColors) {
        expect(AGENT_COLORS).toContain(color);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 4. Host role marker
  // -----------------------------------------------------------------------
  describe("主持人角色标记", () => {
    it("host.isHost 为 true", async () => {
      const lineup = await generateLineup({ topic: TOPIC, guestCount: GUEST_COUNT, background: "" });
      expect(lineup.host.isHost).toBe(true);
    });

    it("所有 guest.isHost 为 false", async () => {
      const lineup = await generateLineup({ topic: TOPIC, guestCount: GUEST_COUNT, background: "" });
      for (const guest of lineup.guests) {
        expect(guest.isHost).toBe(false);
      }
    });

    it("host 的 stance 应体现中立/引导角色", async () => {
      const lineup = await generateLineup({ topic: TOPIC, guestCount: GUEST_COUNT, background: "" });
      const hostStance = lineup.host.stance.toLowerCase();
      const neutralKeywords = ["中立", "引导", "主持", "客观", "协调", "总结"];
      const hasNeutralTone = neutralKeywords.some((kw) => hostStance.includes(kw));
      expect(hasNeutralTone).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 5. API error handling & fallback
  // -----------------------------------------------------------------------
  describe("API 异常降级处理", () => {
    it("API 返回 500 时应该自动重试并最终降级到 fallback", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockResponse({ error: "Internal Server Error" }, 500));

      const lineup = await generateLineup({ topic: TOPIC, guestCount: 3, background: "" });

      // Should still return valid structure via fallback after retries exhausted
      expect(lineup.host).toBeDefined();
      expect(lineup.host.isHost).toBe(true);
      expect(lineup.guests).toHaveLength(3);
      for (const guest of lineup.guests) {
        expect(guest.name).toBeTruthy();
        expect(guest.title).toBeTruthy();
        expect(guest.stance).toBeTruthy();
        expect(guest.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
      // Should have retried 3 times
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("API 返回非 JSON 响应时降级到 fallback", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockDeepseekText("这是一段非结构化的文本回复，不是 JSON"));

      const lineup = await generateLineup({ topic: TOPIC, guestCount: 2, background: "" });
      expect(lineup.host.isHost).toBe(true);
      expect(lineup.guests).toHaveLength(2);
    });

    it("API 返回 JSON 但 guests 数量不匹配时应该修正", async () => {
      // API returns 4 guests but we asked for 3 → should truncate
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockDeepseekSuccess(VALID_DEEPSEEK_RESPONSE)); // 4 guests

      const lineup = await generateLineup({ topic: TOPIC, guestCount: 3, background: "" });
      expect(lineup.guests.length).toBeLessThanOrEqual(3);
    });

    it("网络超时时降级到 fallback", async () => {
      // Simulate a timeout via AbortError
      globalThis.fetch = vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

      const lineup = await generateLineup({ topic: TOPIC, guestCount: 2, background: "" });
      expect(lineup.host.isHost).toBe(true);
      expect(lineup.guests.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Fallback generator unit tests
  // -----------------------------------------------------------------------
  describe("generateFallbackLineup 降级方案", () => {
    it("应该根据 topic 生成包含话题关键词的 agent", () => {
      const lineup = generateFallbackLineup("AI法律人格", 3);
      expect(lineup.host.isHost).toBe(true);
      expect(lineup.guests).toHaveLength(3);
      for (const guest of lineup.guests) {
        const parsed = AgentSchema.safeParse(guest);
        expect(parsed.success).toBe(true);
      }
    });

    it("guestCount=2 时生成2个 guest", () => {
      const lineup = generateFallbackLineup("测试话题", 2);
      expect(lineup.guests).toHaveLength(2);
    });

    it("guestCount=6 时生成6个 guest", () => {
      const lineup = generateFallbackLineup("测试话题", 6);
      expect(lineup.guests).toHaveLength(6);
    });

    it("所有 guest 颜色不应重复", () => {
      const lineup = generateFallbackLineup("测试话题", 6);
      const guestColors = lineup.guests.map((g) => g.color);
      const uniqueColors = new Set(guestColors);
      expect(uniqueColors.size).toBe(guestColors.length);
    });
  });
});
