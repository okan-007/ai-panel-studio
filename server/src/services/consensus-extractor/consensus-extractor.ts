/**
 * consensus-extractor.ts
 *
 * Pure-function logic for extracting consensus and disagreement points
 * from speech records.
 *
 * Strategy — multi-pass extraction:
 *   1. Tokenize each speech into semantic keyword phrases.
 *   2. Cluster speeches by shared keyword overlap.
 *   3. Classify each cluster as agreed / contested / proposed by comparing
 *      the stance direction (explicit positive/negative language).
 *   4. Merge new results with existing consensus incrementally.
 *
 * This module works purely locally; for production, the same interface
 * can be backed by an LLM call with richer semantic understanding.
 */

import {
  type ConsensusItem,
  ConsensusItemSchema,
} from "../../schemas/consensus.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpeechRecord {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  roundNumber: number;
}

export interface AgentStance {
  agentId: string;
  stance: string;
}

export interface ExtractedConsensusItem {
  content: string;
  agentStances: AgentStance[];
  roundNumber: number;
}

// ---------------------------------------------------------------------------
// Chinese topic phrase extraction
// ---------------------------------------------------------------------------

/**
 * Common Chinese topic-indicator phrases that signal what the speaker
 * is talking about (used to cluster related speeches).
 */
const TOPIC_INDICATORS = [
  "法律人格", "法律框架", "责任主体", "责任归属", "起诉权",
  "财产权", "立法", "监管", "伦理", "技术可行性", "社会影响",
  "国际协作", "国际合作", "权利边界", "人格权", "电子人格",
  "电子代理人", "赋权", "渐进式", "分阶段", "法人资格",
  "法律地位", "数据隐私", "算法透明", "安全性", "公平性",
  "就业影响", "经济影响", "道德责任", "自主决策", "人机协作",
  "司法", "诉讼", "赔偿", "保险", "认证", "许可",
  "透明度", "可解释性", "问责", "追责", "合规",
  "法律责任", "国际协调", "人格化",
];

/** Words to ignore when doing ad-hoc topic discovery */
const STOP_CHARS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人",
  "都", "一", "个", "上", "也", "很", "到", "说", "要", "去",
  "你", "会", "着", "没有", "看", "好", "自己", "这", "他", "她",
  "它", "们", "那", "些", "这个", "那个", "可以", "觉得", "认为",
  "应该", "能够", "可能", "已经", "比较", "非常", "还是", "或者",
  "但是", "因为", "所以", "如果", "虽然", "而且", "不过", "只是",
  "还有", "进行", "需要", "通过", "提出", "使用", "必须", "主要",
  "什么", "怎么", "怎样", "这样", "那样", "这种", "那种",
]);

/**
 * Extract key topic phrases from a block of Chinese text.
 *
 * Only matches against known TOPIC_INDICATORS — this keeps the
 * phrase set small and focused, which makes Jaccard clustering reliable.
 */
function extractTopicPhrases(text: string): string[] {
  const found: string[] = [];
  for (const indicator of TOPIC_INDICATORS) {
    if (text.includes(indicator)) {
      found.push(indicator);
    }
  }
  return [...new Set(found)];
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/**
 * Jaccard-like overlap between two phrase sets.
 */
function phraseOverlap(phrasesA: string[], phrasesB: string[]): number {
  const setA = new Set(phrasesA);
  const setB = new Set(phrasesB);
  let intersection = 0;
  for (const p of setA) {
    if (setB.has(p)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

interface Cluster {
  topic: string;
  speeches: SpeechRecord[];
}

/**
 * Cluster speeches by shared topic phrases.
 */
function clusterSpeeches(speeches: SpeechRecord[]): Cluster[] {
  // Each speech starts as its own cluster
  const clusters: Cluster[] = speeches.map((s) => ({
    topic: "",
    speeches: [s],
  }));

  // Greedy merge: keep merging the two most similar clusters
  // until no pair exceeds the threshold
  const MIN_OVERLAP = 0.3;

  let merged = true;
  while (merged) {
    merged = false;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const phrasesI = clusters[i].speeches.flatMap((s) => extractTopicPhrases(s.content));
        const phrasesJ = clusters[j].speeches.flatMap((s) => extractTopicPhrases(s.content));
        const overlap = phraseOverlap(phrasesI, phrasesJ);

        if (overlap >= MIN_OVERLAP) {
          // Merge j into i
          clusters[i].speeches.push(...clusters[j].speeches);
          // Derive a topic label from the intersecting phrases
          const setI = new Set(phrasesI);
          const setJ = new Set(phrasesJ);
          const shared = [...setI].filter((p) => setJ.has(p));
          clusters[i].topic = shared.slice(0, 3).join(" ") || clusters[i].speeches[0].content.slice(0, 30);
          clusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Name remaining single-speech clusters
  for (const cluster of clusters) {
    if (!cluster.topic) {
      const phrases = extractTopicPhrases(cluster.speeches[0].content);
      cluster.topic = phrases.slice(0, 3).join("") || cluster.speeches[0].content.slice(0, 30);
    }
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Stance direction
// ---------------------------------------------------------------------------

type StanceDir = "support" | "oppose" | "neutral";

/**
 * Detect whether a stance string is supportive or opposing.
 */
function detectStanceDirection(text: string): StanceDir {
  const lower = text;

  // Strong opposition signals (check FIRST — they override support)
  const opposeSignals = [
    "反对", "不同意", "不赞成", "质疑", "否定", "担忧",
    "不应该", "不能", "不可以", "不行", "不合理", "不可行",
    "不认同", "批评", "批判", "我反对", "我不支持",
    "我不认为", "我不觉得", "我不赞同", "不应", "不应当",
    "不予", "拒绝", "排斥", "禁止",
  ];

  // Strong support signals
  const supportSignals = [
    "支持", "同意", "赞成", "认同", "赞同", "肯定",
    "合理", "可行", "必要", "重要", "需要",
    "我同意", "我支持", "我赞成", "我认为应该", "我认同",
    "是个好", "是正确的", "是必要的", "是重要的",
    "应该", "应当", "赋予", "主张", "推动",
  ];

  for (const sig of opposeSignals) {
    if (lower.includes(sig)) return "oppose";
  }
  for (const sig of supportSignals) {
    if (lower.includes(sig)) return "support";
  }

  return "neutral";
}

// ---------------------------------------------------------------------------
// 1. extractConsensus
// ---------------------------------------------------------------------------

export function extractConsensus(
  speeches: SpeechRecord[],
  _existing: ConsensusItem[],
  roundNumber: number
): ConsensusItem[] {
  if (speeches.length === 0) return [];

  if (speeches.length === 1) {
    const phrases = extractTopicPhrases(speeches[0].content);
    const topic = phrases.slice(0, 2).join("") || "独立观点";
    return [
      makeConsensusItem(
        topic,
        [speeches[0].agentId],
        [],
        roundNumber,
        "proposed"
      ),
    ];
  }

  const clusters = clusterSpeeches(speeches);
  const results: ConsensusItem[] = [];

  for (const cluster of clusters) {
    if (cluster.speeches.length === 1) {
      // Single-speech cluster → proposed
      results.push(
        makeConsensusItem(
          cluster.topic,
          [cluster.speeches[0].agentId],
          [],
          roundNumber,
          "proposed"
        )
      );
      continue;
    }

    // Classify by stance alignment
    const stances = cluster.speeches.map((s) => ({
      agentId: s.agentId,
      direction: detectStanceDirection(s.content),
    }));

    const supporters = stances.filter((s) => s.direction === "support");
    const opposers = stances.filter((s) => s.direction === "oppose");
    const neutrals = stances.filter((s) => s.direction === "neutral");

    let status: ConsensusItem["status"];
    let agreedIds: string[];
    let disagreedIds: string[];

    if (supporters.length >= 2 && opposers.length === 0) {
      // Consensus: multiple support, no opposition
      status = "agreed";
      agreedIds = [...supporters.map((s) => s.agentId), ...neutrals.map((s) => s.agentId)];
      disagreedIds = [];
    } else if (opposers.length >= 2 && supporters.length === 0) {
      // All opposed → agreeing on opposition
      status = "agreed";
      agreedIds = [...opposers.map((s) => s.agentId), ...neutrals.map((s) => s.agentId)];
      disagreedIds = [];
    } else if (supporters.length >= 1 && opposers.length >= 1) {
      // Mixed → contested
      status = "contested";
      agreedIds = [...supporters.map((s) => s.agentId), ...neutrals.map((s) => s.agentId)];
      disagreedIds = opposers.map((s) => s.agentId);
    } else if (stances.length >= 2 && neutrals.length === stances.length) {
      // All neutral → proposed (no clear stance)
      status = "proposed";
      agreedIds = stances.map((s) => s.agentId);
      disagreedIds = [];
    } else {
      // Mixed with enough signals
      status = supporters.length >= opposers.length ? "agreed" : "contested";
      agreedIds = [...supporters.map((s) => s.agentId), ...neutrals.map((s) => s.agentId)];
      disagreedIds = opposers.map((s) => s.agentId);
    }

    results.push(
      makeConsensusItem(cluster.topic, agreedIds, disagreedIds, roundNumber, status)
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. classifyAsConsensusOrDisagreement
// ---------------------------------------------------------------------------

export function classifyAsConsensusOrDisagreement(
  items: ExtractedConsensusItem[]
): ConsensusItem[] {
  return items.map((item) => {
    const directions = item.agentStances.map((s) => ({
      agentId: s.agentId,
      direction: detectStanceDirection(s.stance),
    }));

    const supporters = directions.filter((d) => d.direction === "support");
    const opposers = directions.filter((d) => d.direction === "oppose");
    const neutrals = directions.filter((d) => d.direction === "neutral");

    let status: ConsensusItem["status"];
    let agreedIds: string[];
    let disagreedIds: string[];

    if (directions.length === 1) {
      status = "proposed";
      agreedIds = [directions[0].agentId];
      disagreedIds = [];
    } else if (opposers.length >= 1 && supporters.length >= 1) {
      status = "contested";
      agreedIds = [...supporters.map((d) => d.agentId), ...neutrals.map((d) => d.agentId)];
      disagreedIds = opposers.map((d) => d.agentId);
    } else if (supporters.length >= 2) {
      status = "agreed";
      agreedIds = [...supporters.map((d) => d.agentId), ...neutrals.map((d) => d.agentId)];
      disagreedIds = [];
    } else if (opposers.length >= 2) {
      status = "agreed"; // agreement on opposition
      agreedIds = [...opposers.map((d) => d.agentId), ...neutrals.map((d) => d.agentId)];
      disagreedIds = [];
    } else {
      status = "proposed";
      agreedIds = directions.map((d) => d.agentId);
      disagreedIds = [];
    }

    return makeConsensusItem(
      item.content,
      agreedIds,
      disagreedIds,
      item.roundNumber,
      status
    );
  });
}

// ---------------------------------------------------------------------------
// 3. mergeConsensusResults
// ---------------------------------------------------------------------------

export function mergeConsensusResults(
  existing: ConsensusItem[],
  newItems: ConsensusItem[]
): ConsensusItem[] {
  if (existing.length === 0) return newItems;
  if (newItems.length === 0) return existing;

  const merged = [...existing];
  const usedNew = new Set<number>();

  for (let i = 0; i < merged.length; i++) {
    for (let j = 0; j < newItems.length; j++) {
      if (usedNew.has(j)) continue;

      const overlap = phraseOverlap(
        extractTopicPhrases(merged[i].content),
        extractTopicPhrases(newItems[j].content)
      );

      if (overlap >= 0.2) {
        // Merge agent IDs
        const combinedAgreed = [
          ...new Set([...merged[i].agreedAgentIds, ...newItems[j].agreedAgentIds]),
        ];
        const combinedDisagreed = [
          ...new Set([...merged[i].disagreedAgentIds, ...newItems[j].disagreedAgentIds]),
        ];

        // Upgrade status
        let newStatus = merged[i].status;
        if (merged[i].status === "proposed") {
          if (combinedDisagreed.length > 0) {
            newStatus = "contested";
          } else if (combinedAgreed.length >= 2) {
            newStatus = "agreed";
          }
        }

        merged[i] = {
          ...merged[i],
          agreedAgentIds: combinedAgreed,
          disagreedAgentIds: combinedDisagreed,
          status: newStatus,
          roundNumber: Math.max(merged[i].roundNumber, newItems[j].roundNumber),
        };

        usedNew.add(j);
        break;
      }
    }
  }

  // Append unmatched new items
  for (let j = 0; j < newItems.length; j++) {
    if (!usedNew.has(j)) {
      merged.push(newItems[j]);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// 4. Type guards
// ---------------------------------------------------------------------------

export function isConsensusItem(obj: unknown): obj is ConsensusItem {
  const result = ConsensusItemSchema.safeParse(obj);
  return result.success;
}

export function isDisagreementItem(item: ConsensusItem): boolean {
  return item.status === "contested" && item.disagreedAgentIds.length > 0;
}

// ---------------------------------------------------------------------------
// Helper: construct a valid ConsensusItem
// ---------------------------------------------------------------------------

function makeConsensusItem(
  content: string,
  agreedAgentIds: string[],
  disagreedAgentIds: string[],
  roundNumber: number,
  status: ConsensusItem["status"]
): ConsensusItem {
  return {
    id: crypto.randomUUID(),
    content: content || "未分类观点",
    agreedAgentIds,
    disagreedAgentIds,
    roundNumber,
    status,
  };
}
