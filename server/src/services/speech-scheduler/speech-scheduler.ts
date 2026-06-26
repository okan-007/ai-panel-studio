/**
 * speech-scheduler.ts
 *
 * Pure-function state machine that determines:
 *   1. Who should speak next (based on transcript history + agent roster)
 *   2. What type of speech (opening / speech / closing / transition)
 *   3. Whether the discussion should end
 *
 * All functions are deterministic given the same inputs — no randomness,
 * no side effects, no API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpeechType = "opening" | "speech" | "closing" | "transition";

export interface AgentBrief {
  id: string;
  name: string;
  isHost: boolean;
}

export interface SpeechRecord {
  agentId: string;
  roundNumber: number;
  type: string;
  content: string;
}

export interface SpeechAction {
  nextAgentId: string | null;
  speechType: SpeechType;
  roundNumber: number;
  reason: string;
}

export interface SpeechContext {
  promptType: SpeechType;
  instruction: string;
  recentMessages: SpeechRecord[];
  agentName: string;
}

export interface AgentPriority {
  agentId: string;
  score: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SPEECH_LENGTH_CHARS = 100;
const MAX_SPEECH_SENTENCES = 3;

// ---------------------------------------------------------------------------
// 1. getSpeechType
// ---------------------------------------------------------------------------

/**
 * Determine the speech type for a given agent at a given point in the discussion.
 *
 * Rules:
 *   - Round 1, no messages → host does "opening"
 *   - Host in the final round → "closing"
 *   - Any other case → "speech"
 */
export function getSpeechType(
  roundNumber: number,
  agentId: string,
  history: SpeechRecord[],
  agents: AgentBrief[],
  maxRounds?: number,
  discussionStatus?: string
): SpeechType {
  // Abort if discussion has ended
  if (discussionStatus === "completed" || discussionStatus === "stopped") {
    return "closing";
  }

  const agent = agents.find((a) => a.id === agentId);
  const agentSpeechesInRound = history.filter(
    (s) => s.agentId === agentId && s.roundNumber === roundNumber
  );

  // Host opening in round 1
  if (agent?.isHost && roundNumber === 1 && history.length === 0) {
    return "opening";
  }

  // Host closing in final round (after guests have all spoken)
  if (agent?.isHost && maxRounds && roundNumber >= maxRounds) {
    const allGuests = agents.filter((a) => !a.isHost);
    const guestsSpoken = allGuests.every((g) =>
      history.some((s) => s.agentId === g.id && s.roundNumber === roundNumber)
    );
    if (guestsSpoken || agentSpeechesInRound.length === 0) {
      return "closing";
    }
  }

  // Transition: host re-introduces between rounds
  if (
    agent?.isHost &&
    roundNumber > 1 &&
    history.length > 0 &&
    !history.some((s) => s.agentId === agentId && s.roundNumber === roundNumber)
  ) {
    return "transition";
  }

  return "speech";
}

// ---------------------------------------------------------------------------
// 2. computeAgentPriority
// ---------------------------------------------------------------------------

/**
 * Compute a priority score for each agent.
 *
 * Higher score = should speak next.
 *
 * Factors:
 *   - Speech count (fewer → higher)
 *   - Consecutive speeches (just spoke → much lower)
 *   - Host bonus (round start/end only)
 *   - Current round participation (haven't spoken this round → higher)
 */
export function computeAgentPriority(
  agents: AgentBrief[],
  history: SpeechRecord[],
  currentRound: number
): AgentPriority[] {
  // Count speeches per agent (total and per-round)
  const totalCounts = new Map<string, number>();
  const roundCounts = new Map<string, number>();

  for (const a of agents) {
    totalCounts.set(a.id, history.filter((s) => s.agentId === a.id).length);
    roundCounts.set(
      a.id,
      history.filter((s) => s.agentId === a.id && s.roundNumber === currentRound).length
    );
  }

  // Find the last speaker
  const reversed = [...history].reverse();
  const lastSpeakerId = reversed.length > 0 ? reversed[0].agentId : null;

  const results: AgentPriority[] = agents.map((a) => {
    let score = 0;
    const reasons: string[] = [];

    // Base: fewer total speeches = higher priority
    const total = totalCounts.get(a.id) ?? 0;
    score += Math.max(0, 10 - total * 3);
    reasons.push(`总发言${total}次`);

    // Penalty: hasn't spoken in current round → boost
    const roundCount = roundCounts.get(a.id) ?? 0;
    if (roundCount === 0 && !a.isHost) {
      score += 15;
      reasons.push("本轮未发言（大幅提升）");
    } else if (roundCount === 0 && a.isHost) {
      // Host is neutral in mid-round but gets a bonus at round start
      score += 5;
      reasons.push("主持人本轮未发言");
    }

    // Heavy penalty: was the LAST speaker
    if (a.id === lastSpeakerId && !a.isHost) {
      score -= 20;
      reasons.push("上一轮发言人（惩罚）");
    }

    // Moderate penalty for each time they've spoken in this round
    score -= roundCount * 5;
    if (roundCount > 1) {
      reasons.push(`本轮已发言${roundCount}次`);
    }

    // Host: lower priority mid-round, high priority at round boundaries
    if (a.isHost) {
      if (history.length === 0 || (totalCounts.get(a.id) ?? 0) === 0) {
        score += 20; // Host must open
        reasons.push("主持人开场优先");
      } else {
        // In mid-discussion, host priority is suppressed
        score -= 10;
        reasons.push("主持人（非开场阶段降权）");
      }
    }

    return { agentId: a.id, score, reason: reasons.join("; ") };
  });

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ---------------------------------------------------------------------------
// 3. determineNextSpeech
// ---------------------------------------------------------------------------

/**
 * Determine the next speaker and speech type.
 *
 * This is the core scheduling function. It:
 *   1. Handles the very start (host opening)
 *   2. Selects the next guest by priority
 *   3. Handles round transitions
 *   4. Triggers closing when maxRounds is reached
 */
export function determineNextSpeech(
  agents: AgentBrief[],
  history: SpeechRecord[],
  currentRound: number,
  maxRounds: number,
  discussionStatus?: string
): SpeechAction {
  const nonHostAgents = agents.filter((a) => !a.isHost);
  const hostAgent = agents.find((a) => a.isHost);

  // --- Edge: discussion is stopped/completed ---
  if (discussionStatus === "stopped" || discussionStatus === "completed") {
    return {
      nextAgentId: null,
      speechType: "closing",
      roundNumber: currentRound,
      reason: "讨论已结束",
    };
  }

  // --- Very start: host opening ---
  if (history.length === 0) {
    return {
      nextAgentId: hostAgent?.id ?? null,
      speechType: "opening",
      roundNumber: 1,
      reason: "讨论开始，主持人开场",
    };
  }

  // --- Count speakers per round ---
  const roundSpeeches = history.filter((s) => s.roundNumber === currentRound);
  const agentsSpokenThisRound = new Set(roundSpeeches.map((s) => s.agentId));

  // --- End of round check ---
  const allNonHostSpoken = nonHostAgents.every((a) =>
    agentsSpokenThisRound.has(a.id)
  );

  // If all guests have spoken this round AND host hasn't transitioned yet
  if (allNonHostSpoken && !agentsSpokenThisRound.has(hostAgent?.id ?? "")) {
    if (currentRound >= maxRounds) {
      // Final round: host does closing
      return {
        nextAgentId: hostAgent?.id ?? null,
        speechType: "closing",
        roundNumber: currentRound,
        reason: `第${currentRound}轮结束，主持人总结陈词`,
      };
    }
    // Mid-discussion: host transitions to next round
    return {
      nextAgentId: hostAgent?.id ?? null,
      speechType: "transition",
      roundNumber: currentRound + 1,
      reason: `主持人总结第${currentRound}轮，引入第${currentRound + 1}轮`,
    };
  }

  // --- Normal guest selection by priority ---
  const priority = computeAgentPriority(agents, history, currentRound);

  // Skip agents that have already spoken this round (unless all have spoken)
  let candidates = priority;
  if (!allNonHostSpoken) {
    candidates = priority.filter(
      (p) => !agentsSpokenThisRound.has(p.agentId) || agents.find((a) => a.id === p.agentId)?.isHost
    );
  }

  // If no candidates (edge case), use original priority
  if (candidates.length === 0) {
    candidates = priority;
  }

  // Pick the top-scoring non-host agent
  const topNonHost = candidates.find((c) => !agents.find((a) => a.id === c.agentId)?.isHost);

  if (!topNonHost) {
    // Fallback: host again
    return {
      nextAgentId: hostAgent?.id ?? null,
      speechType: "transition",
      roundNumber: currentRound,
      reason: "无可用发言人，主持人接管",
    };
  }

  // Determine speech type for this agent
  const speechType: SpeechType = getSpeechType(
    currentRound,
    topNonHost.agentId,
    history,
    agents,
    maxRounds,
    discussionStatus
  );

  return {
    nextAgentId: topNonHost.agentId,
    speechType,
    roundNumber: currentRound,
    reason: topNonHost.reason,
  };
}

// ---------------------------------------------------------------------------
// 4. shouldEndDiscussion
// ---------------------------------------------------------------------------

/**
 * Determine whether the discussion has reached its natural end.
 */
export function shouldEndDiscussion(
  currentRound: number,
  maxRounds: number,
  history: SpeechRecord[],
  discussionStatus?: string
): boolean {
  // Explicit stop
  if (discussionStatus === "stopped") return true;
  // Already completed
  if (discussionStatus === "completed") return true;
  // Paused — not ending
  if (discussionStatus === "paused") return false;

  // Exceeded max rounds
  if (currentRound > maxRounds) return true;

  // All rounds done AND closing speeches have been made
  if (currentRound === maxRounds) {
    const closingSpeeches = history.filter(
      (s) => s.roundNumber === maxRounds && s.type === "closing"
    );
    // At least one closing speech in the final round signals the end
    if (closingSpeeches.length > 0) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// 5. computeSpeechContext
// ---------------------------------------------------------------------------

/**
 * Build the speech context (prompt components) for the next agent.
 *
 * This is used by the prompt service to construct the actual LLM prompt.
 */
export function computeSpeechContext(
  agent: AgentBrief,
  speechType: SpeechType,
  roundNumber: number,
  history: SpeechRecord[],
  topic: string
): SpeechContext {
  // Get the most recent messages (last 6 or all if fewer)
  const recentMessages = history.slice(-6);

  let instruction: string;

  switch (speechType) {
    case "opening":
      instruction = `你是本次圆桌讨论的主持人。讨论话题为"${topic}"。请发表开场白，介绍话题背景并引导嘉宾发言。控制在2-3句话。`;
      break;

    case "transition":
      instruction = `第${roundNumber - 1}轮讨论已结束。请用1-2句话总结上一轮的核心观点，并引入第${roundNumber}轮的讨论方向。`;
      break;

    case "closing":
      instruction = `讨论已进入尾声。请根据全部对话记录，用3-4句话进行总结陈词，概述各方核心立场、已达成共识和仍存分歧的要点。`;
      break;

    case "speech":
    default: {
      const lastSpeaker = recentMessages.length > 0
        ? recentMessages[recentMessages.length - 1]
        : null;
      const lastSpeakerRef = lastSpeaker
        ? `上一位发言人（${lastSpeaker.agentId}）在第${lastSpeaker.roundNumber}轮发表了观点。`
        : "";

      instruction = `你是${agent.name}。讨论话题为"${topic}"。${lastSpeakerRef}请针对之前的观点进行回应，阐述你的立场。请控制在1-2句话，直接、凝练。`;
      break;
    }
  }

  return {
    promptType: speechType,
    instruction,
    recentMessages,
    agentName: agent.name,
  };
}

// ---------------------------------------------------------------------------
// 6. validateSpeechLength
// ---------------------------------------------------------------------------

/**
 * Validate that a generated speech is within acceptable length limits.
 *
 * Rules:
 *   - Non-empty
 *   - ≤ MAX_SPEECH_LENGTH_CHARS characters
 *   - ≤ MAX_SPEECH_SENTENCES sentences (delimited by 。！？.!?)
 */
export function validateSpeechLength(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > MAX_SPEECH_LENGTH_CHARS) return false;

  // Count sentences by Chinese and English punctuation
  const sentenceEnders = /[。！？.!?]/g;
  const sentences = trimmed.split(sentenceEnders).filter((s) => s.trim().length > 0);

  return sentences.length <= MAX_SPEECH_SENTENCES;
}
