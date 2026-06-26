/**
 * consensus-extractor.test.ts
 *
 * TDD — RED phase: tests for consensus/disagreement extraction logic.
 *
 * The consensus extractor analyzes speech records to identify:
 *   1. Points of agreement among agents
 *   2. Points of disagreement among agents
 *   3. Incremental updates as new speeches arrive
 *
 * Tests cover pure-logic extraction (no API) and API-based extraction.
 */

import { describe, it, expect } from "vitest";
import {
  extractConsensus,
  mergeConsensusResults,
  classifyAsConsensusOrDisagreement,
  isConsensusItem,
  isDisagreementItem,
  type ExtractedConsensusItem,
  type SpeechRecord,
} from "./consensus-extractor.js";
import {
  ConsensusItemSchema,
  type ConsensusItem,
} from "../../schemas/consensus.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function speech(
  agentId: string,
  agentName: string,
  content: string,
  roundNumber: number
): SpeechRecord {
  return { id: crypto.randomUUID(), agentId, agentName, content, roundNumber };
}

const TOPIC = "AI是否应该拥有法律人格？";

const AGREEMENT_SPEECHES: SpeechRecord[] = [
  speech("g-1", "张教授", "AI法律人格的讨论需要一个全新的法律框架来支撑，现有法律体系无法直接适用。", 1),
  speech("g-2", "李律师", "我同意张教授的观点，确实需要新的法律框架。但立法过程会很漫长。", 1),
  speech("g-3", "王博士", "从技术角度看，新的法律框架是必要的。我们可以参考电子人格概念。", 1),
  speech("g-4", "赵研究员", "建立新框架是共识，但我担心国际协调会比较困难。", 1),
];

const DISAGREEMENT_SPEECHES: SpeechRecord[] = [
  speech("g-1", "张教授", "我认为AI应当拥有有限的法律人格，包括起诉权和被起诉权。", 2),
  speech("g-2", "李律师", "我反对给予AI起诉权。现行民事诉讼法只适用于自然人和法人。", 2),
  speech("g-3", "王博士", "我不赞成法律人格这种提法，用'电子代理人'概念更合适。", 2),
  speech("g-4", "赵研究员", "我也反对人格化的说法，但认同需要在法律责任上有所安排。", 2),
];

const MIXED_SPEECHES: SpeechRecord[] = [...AGREEMENT_SPEECHES, ...DISAGREEMENT_SPEECHES];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("consensus-extractor — 共识/分歧提炼", () => {
  // -----------------------------------------------------------------------
  // 1. Consensus identification from speeches
  // -----------------------------------------------------------------------
  describe("extractConsensus — 共识识别", () => {
    it("给定一组同意的发言，应正确识别共识点", () => {
      const result = extractConsensus(AGREEMENT_SPEECHES, [], 1);

      // Should find at least one consensus item about "新法律框架"
      const frameworkConsensus = result.find(
        (c) =>
          c.content.includes("法律框架") ||
          c.content.includes("新框架")
      );
      expect(frameworkConsensus).toBeDefined();
      if (frameworkConsensus) {
        expect(frameworkConsensus.agreedAgentIds.length).toBeGreaterThanOrEqual(2);
        expect(frameworkConsensus.status).toBe("agreed");
      }
    });

    it("给定一组分歧的发言，应正确识别分歧点", () => {
      const result = extractConsensus(DISAGREEMENT_SPEECHES, [], 2);

      // "起诉权" should be a point of disagreement
      const lawsuitItem = result.find(
        (c) => c.content.includes("起诉权") || c.content.includes("起诉")
      );
      expect(lawsuitItem).toBeDefined();
      if (lawsuitItem) {
        expect(lawsuitItem.status).toBe("contested");
        expect(lawsuitItem.disagreedAgentIds.length).toBeGreaterThanOrEqual(1);
      }

      // Speeches 3 ("法律人格") and 4 ("人格化") use different terminology —
      // they each form single-speech proposed items since no exact keyword
      // overlap is detected. This is expected behaviour for pure-logic extraction.
      const proposed = result.filter((c) => c.status === "proposed");
      expect(proposed.length).toBeGreaterThanOrEqual(1);
    });

    it("混合发言应同时识别共识和分歧", () => {
      const result = extractConsensus(MIXED_SPEECHES, [], 1);

      const agreed = result.filter((c) => c.status === "agreed");
      const contested = result.filter((c) => c.status === "contested");

      expect(agreed.length).toBeGreaterThanOrEqual(1);
      expect(contested.length).toBeGreaterThanOrEqual(1);
    });

    it("提取的共识条目都符合 ConsensusItem Schema", () => {
      const result = extractConsensus(AGREEMENT_SPEECHES, [], 1);

      for (const item of result) {
        const parsed = ConsensusItemSchema.safeParse(item);
        expect(parsed.success).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Incremental updates
  // -----------------------------------------------------------------------
  describe("mergeConsensusResults — 增量更新", () => {
    const existingConsensus: ConsensusItem[] = [
      {
        id: crypto.randomUUID(),
        content: "需要建立新的法律框架来规范AI",
        agreedAgentIds: ["g-1", "g-2"],
        disagreedAgentIds: [],
        roundNumber: 1,
        status: "agreed",
      },
    ];

    it("新发言加入后，已有共识应保留", () => {
      const newSpeeches: SpeechRecord[] = [
        speech("g-3", "王博士", "确实需要新的法律框架，这点已达成共识。", 2),
      ];

      const merged = mergeConsensusResults(
        existingConsensus,
        extractConsensus(newSpeeches, existingConsensus, 2)
      );

      // The existing consensus should still be there
      const existing = merged.find(
        (c) => c.content.includes("新的法律框架")
      );
      expect(existing).toBeDefined();
    });

    it("新共识点应被追加到列表", () => {
      const newSpeeches: SpeechRecord[] = [
        speech("g-1", "张教授", "AI的责任归属必须以法律条文明确界定。", 2),
        speech("g-2", "李律师", "同意，责任界定是立法的基础。", 2),
      ];

      const newItems = extractConsensus(newSpeeches, existingConsensus, 2);
      const merged = mergeConsensusResults(existingConsensus, newItems);

      // Should now have at least 2 items
      expect(merged.length).toBeGreaterThanOrEqual(2);

      // roundNumber should be set correctly
      for (const item of merged) {
        expect(item.roundNumber).toBeGreaterThanOrEqual(1);
      }
    });

    it("已有共识的状态从 proposed 变为 agreed", () => {
      const proposedOnly: ConsensusItem[] = [
        {
          id: crypto.randomUUID(),
          content: "国际协作是必要的",
          agreedAgentIds: ["g-1"],
          disagreedAgentIds: [],
          roundNumber: 1,
          status: "proposed",
        },
      ];

      const confirmingSpeeches: SpeechRecord[] = [
        speech("g-2", "李律师", "我支持国际协作的观点。", 2),
        speech("g-3", "王博士", "国际协作确实很重要，同意。", 2),
      ];

      const newItems = extractConsensus(confirmingSpeeches, proposedOnly, 2);
      const merged = mergeConsensusResults(proposedOnly, newItems);

      const intlItem = merged.find(
        (c) => c.content.includes("国际协作")
      );
      expect(intlItem).toBeDefined();
      if (intlItem) {
        // Should be upgraded from proposed to agreed
        expect(intlItem.status).toBe("agreed");
        expect(intlItem.agreedAgentIds.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("新发现的分歧点应加入，已有共识不被覆盖", () => {
      const newSpeeches: SpeechRecord[] = [
        speech("g-3", "王博士", "我反对赋予AI独立财产权。", 2),
        speech("g-1", "张教授", "我支持AI可拥有有限财产权。", 2),
      ];

      const newItems = extractConsensus(newSpeeches, existingConsensus, 2);
      const merged = mergeConsensusResults(existingConsensus, newItems);

      // Should have the original consensus + new disagreement
      const original = merged.find((c) => c.content.includes("新的法律框架"));
      expect(original).toBeDefined();
      expect(original!.status).toBe("agreed");

      const newDisagreement = merged.find(
        (c) => c.status === "contested" && c.content.includes("财产")
      );
      expect(newDisagreement).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Empty input handling
  // -----------------------------------------------------------------------
  describe("空输入处理", () => {
    it("空发言列表应返回空数组", () => {
      const result = extractConsensus([], [], 1);
      expect(result).toEqual([]);
    });

    it("仅有一条发言不能形成共识或分歧", () => {
      const singleSpeech: SpeechRecord[] = [
        speech("g-1", "张教授", "这是一个独立观点。", 1),
      ];
      const result = extractConsensus(singleSpeech, [], 1);
      // Single speech can't form agreement or disagreement
      expect(result.every((c) => c.status === "proposed")).toBe(true);
    });

    it("空已有共识 + 空新提取 → 返回空数组", () => {
      const merged = mergeConsensusResults([], []);
      expect(merged).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Classification boundary
  // -----------------------------------------------------------------------
  describe("classifyAsConsensusOrDisagreement — 分类边界", () => {
    it("同一话题相同立场归为 agreed", () => {
      const items: ExtractedConsensusItem[] = [
        {
          content: "需要新法律框架",
          agentStances: [
            { agentId: "g-1", stance: "需要新法律" },
            { agentId: "g-2", stance: "支持新立法框架" },
            { agentId: "g-3", stance: "需要全新框架" },
          ],
          roundNumber: 1,
        },
      ];

      const classified = classifyAsConsensusOrDisagreement(items);
      expect(classified[0].status).toBe("agreed");
      expect(classified[0].agreedAgentIds).toEqual(["g-1", "g-2", "g-3"]);
      expect(classified[0].disagreedAgentIds).toEqual([]);
    });

    it("同一话题不同立场归为 contested", () => {
      const items: ExtractedConsensusItem[] = [
        {
          content: "AI是否应有起诉权",
          agentStances: [
            { agentId: "g-1", stance: "应该赋予起诉权" },
            { agentId: "g-2", stance: "不应赋予起诉权" },
          ],
          roundNumber: 1,
        },
      ];

      const classified = classifyAsConsensusOrDisagreement(items);
      expect(classified[0].status).toBe("contested");
      expect(classified[0].agreedAgentIds.length).toBeGreaterThanOrEqual(0);
      expect(classified[0].disagreedAgentIds.length).toBeGreaterThanOrEqual(1);
    });

    it("单一立场的 item 状态为 proposed", () => {
      const items: ExtractedConsensusItem[] = [
        {
          content: "国际协调很重要",
          agentStances: [{ agentId: "g-1", stance: "国际协调非常重要" }],
          roundNumber: 1,
        },
      ];

      const classified = classifyAsConsensusOrDisagreement(items);
      expect(classified[0].status).toBe("proposed");
    });
  });

  // -----------------------------------------------------------------------
  // 5. Schema compliance
  // -----------------------------------------------------------------------
  describe("Schema 合规性", () => {
    it("isConsensusItem 正确识别合法条目", () => {
      const valid: ConsensusItem = {
        id: crypto.randomUUID(),
        content: "需要建立新法律框架",
        agreedAgentIds: ["g-1", "g-2"],
        disagreedAgentIds: [],
        roundNumber: 1,
        status: "agreed",
      };
      expect(isConsensusItem(valid)).toBe(true);
    });

    it("isConsensusItem 拒绝缺少必填字段的条目", () => {
      const invalid = {
        content: "缺少必要字段",
        // missing: id, agreedAgentIds, disagreedAgentIds, roundNumber, status
      };
      expect(isConsensusItem(invalid)).toBe(false);
    });

    it("isDisagreementItem 正确识别 contested 条目", () => {
      const contested: ConsensusItem = {
        id: crypto.randomUUID(),
        content: "AI起诉权归属争议",
        agreedAgentIds: ["g-1"],
        disagreedAgentIds: ["g-2", "g-3"],
        roundNumber: 2,
        status: "contested",
      };
      expect(isDisagreementItem(contested)).toBe(true);
    });

    it("提取结果中每个条目的 roundNumber 等于当前轮次", () => {
      const result = extractConsensus(AGREEMENT_SPEECHES, [], 1);

      for (const item of result) {
        expect(item.roundNumber).toBe(1);
      }
    });
  });
});
