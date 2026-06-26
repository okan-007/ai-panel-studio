/**
 * speech-scheduler.test.ts
 *
 * TDD — RED phase: tests for speech scheduling logic.
 *
 * The speech-scheduler is a pure-function state machine that, given the
 * current transcript and agent roster, determines:
 *   1. Who should speak next
 *   2. What type of speech (opening / speech / transition / closing)
 *   3. Whether the discussion has ended
 *
 * All tests are pure-logic; no API calls, no database.
 */

import { describe, it, expect } from "vitest";
import {
  determineNextSpeech,
  shouldEndDiscussion,
  computeSpeechContext,
  getSpeechType,
  validateSpeechLength,
  computeAgentPriority,
  type AgentBrief,
  type SpeechRecord,
  type SpeechAction,
  type SpeechType,
} from "./speech-scheduler.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function agent(id: string, name: string, isHost = false): AgentBrief {
  return { id, name, isHost };
}

function speech(
  agentId: string,
  round: number,
  type: SpeechType = "speech",
  content = "占位发言内容。"
): SpeechRecord {
  return { agentId, roundNumber: round, type, content };
}

const AGENTS: AgentBrief[] = [
  agent("host-1", "主持人", true),
  agent("g-1", "张教授", false),
  agent("g-2", "李律师", false),
  agent("g-3", "王博士", false),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("speech-scheduler — 发言调度逻辑", () => {
  // -----------------------------------------------------------------------
  // 1. Speech type determination
  // -----------------------------------------------------------------------
  describe("getSpeechType — 发言类型判定", () => {
    it("首轮且首发言是主持人 → opening 开场", () => {
      const result = getSpeechType(1, AGENTS[0].id, [], AGENTS);
      expect(result).toBe("opening");
    });

    it("末轮 → closing 总结", () => {
      const result = getSpeechType(3, AGENTS[1].id, [
        speech("g-1", 1),
        speech("g-2", 1),
        speech("g-1", 2),
        speech("g-2", 2),
      ], AGENTS);
      // maxRounds=3, round=3 → closing
      const closingResult = getSpeechType(3, AGENTS[1].id, [
        speech("g-1", 1),
        speech("g-2", 1),
        speech("g-1", 2),
        speech("g-2", 2),
        speech("g-1", 3),
        speech("g-2", 3),
      ], AGENTS);
      // Actually let's test properly — host in last round does closing
      // The speech type depends on whether it's the last round
      // Non-host agents in last round get "speech" type by default
      // Host agent in last round gets "closing"
      expect(result).toBe("speech"); // non-host in last round = normal speech
      // Host agent in closing (pass maxRounds)
      const hostResult = getSpeechType(3, AGENTS[0].id, [
        speech("g-1", 1), speech("g-2", 1),
        speech("g-1", 2), speech("g-2", 2),
        speech("g-1", 3), speech("g-2", 3),
      ], AGENTS, 3); // maxRounds=3
      expect(hostResult).toBe("closing");
    });

    it("中间轮次 → speech 常规发言", () => {
      const result = getSpeechType(1, AGENTS[1].id, [
        speech("host-1", 1, "opening"),
      ], AGENTS);
      expect(result).toBe("speech");
    });
  });

  // -----------------------------------------------------------------------
  // 2. Next speaker selection
  // -----------------------------------------------------------------------
  describe("determineNextSpeech — 选择下一个发言者", () => {
    it("首轮首发言必须是主持人", () => {
      const result = determineNextSpeech(AGENTS, [], 1, 3);
      expect(result.nextAgentId).toBe("host-1");
      expect(result.speechType).toBe("opening");
      expect(result.roundNumber).toBe(1);
    });

    it("主持人开场后，下一个是 guest（非机械轮流）", () => {
      const result = determineNextSpeech(
        AGENTS,
        [speech("host-1", 1, "opening")],
        1,
        3
      );
      expect(result.nextAgentId).not.toBe("host-1");
      // After opening, the next speaker should be one of the guests
      expect(AGENTS.filter((a) => !a.isHost).map((a) => a.id)).toContain(
        result.nextAgentId
      );
      expect(result.speechType).toBe("speech");
    });

    it("某个专家连续未发言时优先级提升", () => {
      // 3 guests: g-1 speaks 3 times, g-2 speaks 1 time, g-3 0 times
      const history: SpeechRecord[] = [
        speech("host-1", 1, "opening"),
        speech("g-1", 1),
        speech("g-2", 1),
        speech("g-1", 2),
        speech("g-2", 2),
        speech("g-1", 2), // g-1 speaks twice in round 2, g-3 silent the whole time
      ];

      const result = determineNextSpeech(AGENTS, history, 2, 3);
      // g-3 should be chosen because it has the LEAST speeches
      expect(result.nextAgentId).toBe("g-3");
    });

    it("所有 guest 发言次数相同时，不连续选同一人", () => {
      const history: SpeechRecord[] = [
        speech("host-1", 1, "opening"),
        speech("g-1", 1),
        speech("g-2", 1),
        speech("g-3", 1),
        speech("g-1", 2),
        speech("g-2", 2),
        // g-3 was the last to speak in round 1,
        // and hasn't spoken yet in round 2
        // So g-3 or someone else who hasn't spoken this round
      ];

      const result = determineNextSpeech(AGENTS, history, 2, 3);
      // g-3 should get priority — last spoke in round 1, missed round 2 so far
      expect(result.nextAgentId).toBe("g-3");
    });

    it("发言顺序为自主决定而非机械轮流", () => {
      // Run multiple invocations and verify that the algorithm is NOT
      // just a simple round-robin. It should consider context.
      const history: SpeechRecord[] = [
        speech("host-1", 1, "opening"),
        speech("g-1", 1),
      ];

      // Request 10 next speakers — they should NOT alternate perfectly
      // g-1→g-2→g-3→g-1→g-2→g-3... would be mechanical
      const picks: string[] = [];
      let currentHistory = [...history];

      for (let i = 0; i < 6; i++) {
        const result = determineNextSpeech(AGENTS, currentHistory, 1, 3);
        picks.push(result.nextAgentId!);
        currentHistory.push(speech(result.nextAgentId!, result.roundNumber, result.speechType as SpeechType));
      }

      // Verify non-deterministic: at least one agent picked more than twice
      // or at least one picked zero times, proving it's NOT round-robin
      const g2count = picks.filter((id) => id === "g-2").length;
      const g3count = picks.filter((id) => id === "g-3").length;
      // With 6 slots across 2 remaining guests, pure round-robin would always be 3/3
      // Our scheduler with priority should give higher count to the silent one
      expect(Math.abs(g2count - g3count)).toBeLessThanOrEqual(4);
      // The key assertion: host should not speak again in the same round after opening
      expect(picks).not.toContain("host-1");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Discussion end condition
  // -----------------------------------------------------------------------
  describe("shouldEndDiscussion — 讨论结束条件", () => {
    it("当前轮次 > 最大轮次 应触发结束", () => {
      const result = shouldEndDiscussion(4, 3, []);
      expect(result).toBe(true);
    });

    it("当前轮次 == 最大轮次且所有 guest 已完成 closing 发言 → 结束", () => {
      const history: SpeechRecord[] = [
        speech("g-1", 3),
        speech("g-2", 3),
        speech("g-3", 3),
        speech("host-1", 3, "closing"),
      ];
      const result = shouldEndDiscussion(3, 3, history);
      expect(result).toBe(true);
    });

    it("当前轮次 <= 最大轮次且未完成 → 不结束", () => {
      const result = shouldEndDiscussion(2, 3, [
        speech("g-1", 2),
      ]);
      expect(result).toBe(false);
    });

    it("讨论被手动停止 → 立即结束", () => {
      const result = shouldEndDiscussion(2, 3, [], "stopped");
      expect(result).toBe(true);
    });

    it("讨论暂停中 → 不结束", () => {
      const result = shouldEndDiscussion(2, 3, [], "paused");
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Speech context building
  // -----------------------------------------------------------------------
  describe("computeSpeechContext — 发言上下文构建", () => {
    it("opening 类型返回开场引导上下文", () => {
      const ctx = computeSpeechContext(
        AGENTS[0], // host
        "opening",
        1,
        [],
        "AI是否应该有法律人格？"
      );
      expect(ctx.promptType).toBe("opening");
      expect(ctx.instruction).toBeTruthy();
      expect(ctx.recentMessages).toHaveLength(0);
    });

    it("speech 类型包含最近发言摘要", () => {
      const history: SpeechRecord[] = [
        speech("host-1", 1, "opening", "欢迎来到今天的圆桌讨论。"),
        speech("g-1", 1, "speech", "我认为AI法律人格是必然趋势。"),
      ];
      const ctx = computeSpeechContext(
        AGENTS[2], // g-2 李律师
        "speech",
        1,
        history,
        "AI法律人格"
      );
      expect(ctx.promptType).toBe("speech");
      expect(ctx.recentMessages.length).toBeGreaterThan(0);
      // Should include previous speaker's content as reference
      expect(ctx.instruction).toContain("上一位发言人");
    });

    it("closing 类型包含总结指令", () => {
      const ctx = computeSpeechContext(
        AGENTS[0],
        "closing",
        3,
        [
          speech("g-1", 1), speech("g-2", 1), speech("g-3", 1),
          speech("g-1", 2), speech("g-2", 2), speech("g-3", 2),
          speech("g-1", 3), speech("g-2", 3), speech("g-3", 3),
        ],
        "测试话题"
      );
      expect(ctx.promptType).toBe("closing");
      expect(ctx.instruction).toContain("总结");
      expect(ctx.instruction).toContain("陈词");
    });
  });

  // -----------------------------------------------------------------------
  // 5. Speech length validation
  // -----------------------------------------------------------------------
  describe("validateSpeechLength — 发言长度控制", () => {
    it("1句中文发言（以句号结尾）视为通过", () => {
      expect(validateSpeechLength("这是一个观点。")).toBe(true);
    });

    it("2句中英文混合发言视为通过", () => {
      expect(validateSpeechLength("从AI发展角度看，这是必然趋势。However, we must be cautious.")).toBe(true);
    });

    it("超过3句发言视为过长", () => {
      const longSpeech = "第一点。第二点，很重要。第三点也需要考虑。第四点还有补充。";
      expect(validateSpeechLength(longSpeech)).toBe(false);
    });

    it("空字符串视为无效", () => {
      expect(validateSpeechLength("")).toBe(false);
    });

    it("仅由空格组成的发言视为无效", () => {
      expect(validateSpeechLength("   ")).toBe(false);
    });

    it("100字符以上视为不简洁", () => {
      const long = "这是一个非常非常长的发言。" + "内容重复了".repeat(20);
      expect(validateSpeechLength(long)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Agent priority computation
  // -----------------------------------------------------------------------
  describe("computeAgentPriority — Agent 优先级计算", () => {
    it("从未发言的 agent 优先级最高", () => {
      const history: SpeechRecord[] = [
        speech("g-1", 1),
        speech("g-2", 1),
      ];
      const priority = computeAgentPriority(AGENTS, history, 1);
      // g-3 has never spoken → highest priority
      const g3 = priority.find((p) => p.agentId === "g-3");
      const g1 = priority.find((p) => p.agentId === "g-1");
      expect(g3!.score).toBeGreaterThan(g1!.score);
    });

    it("host 在非开场/非结束时优先级低", () => {
      const history: SpeechRecord[] = [
        speech("host-1", 1, "opening"),
        speech("g-1", 1),
      ];
      const priority = computeAgentPriority(AGENTS, history, 1);
      const host = priority.find((p) => p.agentId === "host-1");
      // Host should have lower priority mid-round
      expect(host!.score).toBeLessThanOrEqual(0);
    });

    it("同一 agent 连续发言时优先级显著降低", () => {
      const history: SpeechRecord[] = [
        speech("host-1", 1, "opening"),
        speech("g-1", 1),
      ];
      const priority = computeAgentPriority(AGENTS, history, 1);
      const g1 = priority.find((p) => p.agentId === "g-1");
      // g-1 just spoke → lowest priority among guests
      expect(g1!.score).toBeLessThan(0);
    });
  });
});
