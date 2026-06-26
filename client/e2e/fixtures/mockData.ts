/**
 * Mock data factories for E2E tests.
 *
 * Every factory returns deterministic data so tests are reproducible.
 */

// ---------------------------------------------------------------------------
// Agent / Lineup
// ---------------------------------------------------------------------------

export interface MockAgent {
  id: string;
  name: string;
  title: string;
  stance: string;
  color: string;
  isHost: boolean;
  sortOrder: number;
}

export interface MockLineup {
  host: MockAgent;
  guests: MockAgent[];
}

export function createMockLineup(
  topic: string,
  guestCount: number,
  seed = 0
): MockLineup {
  const archetypes = [
    { name: "张明远", title: "AI伦理研究所所长", stance: "支持渐进式赋权，主张分阶段立法", color: "#3B82F6" },
    { name: "李思齐", title: "科技法律事务所合伙人", stance: "审慎监管，现行法律框架需要先行完善", color: "#F59E0B" },
    { name: "王晓峰", title: "计算机科学AI研究员", stance: "反对AI人格化，主张电子代理人概念", color: "#EF4444" },
    { name: "赵雪梅", title: "社会学公共政策教授", stance: "关注AI对社会结构的深远影响", color: "#8B5CF6" },
    { name: "陈志强", title: "科技企业CEO", stance: "支持敏捷迭代，产业实践优先", color: "#06B6D4" },
    { name: "刘雨桐", title: "公共政策分析师", stance: "提出分阶段路线图，平衡各方利益", color: "#F97316" },
  ];

  const guests: MockAgent[] = archetypes.slice(0, guestCount).map((a, i) => ({
    id: `agent-g-${seed}-${i}`,
    name: a.name,
    title: a.title,
    stance: `关于"${topic.slice(0, 20)}"，${a.stance}`,
    color: a.color,
    isHost: false,
    sortOrder: i,
  }));

  return {
    host: {
      id: `agent-host-${seed}`,
      name: "AI主持人",
      title: "圆桌讨论引导者",
      stance: `围绕"${topic.slice(0, 20)}"保持中立客观立场，引导各方充分表达`,
      color: "#6B7280",
      isHost: true,
      sortOrder: -1,
    },
    guests,
  };
}

// ---------------------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------------------

export interface MockDiscussion {
  id: string;
  title: string;
  background: string;
  status: "draft" | "ready" | "running" | "paused" | "completed" | "stopped";
  maxRounds: number;
  currentRound: number;
  agentCount: number;
  speechCount: number;
  createdAt: string;
  updatedAt: string;
}

export function createMockDiscussion(overrides: Partial<MockDiscussion> = {}): MockDiscussion {
  return {
    id: "disc-001",
    title: "人工智能是否会取代人类工作？",
    background: "探讨AI对就业市场的影响以及人类如何适应",
    status: "ready",
    maxRounds: 3,
    currentRound: 0,
    agentCount: 4,
    speechCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockDiscussionList(count: number): MockDiscussion[] {
  const statuses: MockDiscussion["status"][] = ["running", "completed", "completed", "paused"];
  return Array.from({ length: count }, (_, i) =>
    createMockDiscussion({
      id: `disc-${String(i + 1).padStart(3, "0")}`,
      title: [
        "人工智能是否会取代人类工作？",
        "AI是否应该拥有法律人格？",
        "自动驾驶的道德困境",
        "数据隐私与公共安全的平衡",
      ][i] ?? `测试讨论 ${i + 1}`,
      status: statuses[i] ?? "completed",
      currentRound: i % 2 === 0 ? 2 : 3,
      agentCount: [4, 3, 5, 4][i] ?? 3,
      speechCount: i * 4,
      createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
      updatedAt: new Date(Date.now() - i * 600_000).toISOString(),
    })
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface MockMessage {
  id: string;
  discussionId: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  agentColor: string;
  roundNumber: number;
  type: "opening" | "speech" | "closing" | "system" | "thinking";
  content: string;
  isStreaming: boolean;
  createdAt: string;
}

export function createMockTranscript(discussionId: string, agents: MockAgent[]): MockMessage[] {
  const messages: MockMessage[] = [];
  const now = Date.now();
  const host = agents[0];

  // Round 1 — opening + initial speeches
  messages.push({
    id: "msg-001", discussionId, agentId: host.id, agentName: host.name,
    agentRole: host.title, agentColor: host.color, roundNumber: 1,
    type: "opening",
    content: "欢迎各位专家来到今天的圆桌讨论。今天我们将探讨一个关乎未来的重要话题。请各位畅所欲言。",
    isStreaming: false, createdAt: new Date(now - 300_000).toISOString(),
  });

  agents.slice(1, 4).forEach((agent, i) => {
    messages.push({
      id: `msg-00${i + 2}`, discussionId, agentId: agent.id, agentName: agent.name,
      agentRole: agent.title, agentColor: agent.color, roundNumber: 1,
      type: "speech",
      content: [
        "我认为AI确实会取代部分重复性工作，但这将释放人类创造力。",
        "从法律角度看，我们需要为AI时代的劳动法做好准备。",
        "技术迭代速度远超社会适应速度，这是最大的挑战。",
      ][i],
      isStreaming: false, createdAt: new Date(now - (300_000 - (i + 1) * 60_000)).toISOString(),
    });
  });

  // Round 2
  messages.push({
    id: "msg-005", discussionId, agentId: host.id, agentName: host.name,
    agentRole: host.title, agentColor: host.color, roundNumber: 2,
    type: "transition",
    content: "第一轮讨论非常精彩。现在我们进入第二轮，请针对彼此的观点进行回应。",
    isStreaming: false, createdAt: new Date(now - 120_000).toISOString(),
  });

  return messages;
}

// ---------------------------------------------------------------------------
// Consensus / Disagreement
// ---------------------------------------------------------------------------

export interface MockConsensusItem {
  id: string;
  content: string;
  agreedAgentIds: string[];
  disagreedAgentIds: string[];
  roundNumber: number;
  status: "proposed" | "agreed" | "contested";
}

export function createMockConsensus(agents: MockAgent[]): MockConsensusItem[] {
  const [a1, a2, a3, a4] = agents;
  return [
    {
      id: "cons-001",
      content: "AI将显著改变就业结构，需要提前准备",
      agreedAgentIds: [a1.id, a2.id, a3.id].filter(Boolean),
      disagreedAgentIds: [],
      roundNumber: 1,
      status: "agreed",
    },
    {
      id: "cons-002",
      content: "政府是否应通过立法限制AI应用速度",
      agreedAgentIds: [a2.id].filter(Boolean),
      disagreedAgentIds: [a1.id, a4?.id].filter(Boolean),
      roundNumber: 2,
      status: "contested",
    },
  ];
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function createMockFinalSummary(): string {
  return `## 讨论总结

本次圆桌讨论围绕"人工智能是否会取代人类工作"展开，4位专家参与，共3轮对话。

### 核心观点
- 张明远（AI伦理研究所所长）认为AI将释放人类创造力
- 李思齐（科技法律事务所合伙人）强调法律框架需先行
- 王晓峰（计算机科学AI研究员）关注技术迭代速度
- 赵雪梅（社会学公共政策教授）从社会结构角度分析

### 已达成共识 (1项)
1. AI将显著改变就业结构，需要提前准备

### 仍存分歧 (1项)
1. 政府是否应通过立法限制AI应用速度

### 结论
技术进步不可逆转，人类需要主动适应而非被动抵制。`;
}

// ---------------------------------------------------------------------------
// SSE Events
// ---------------------------------------------------------------------------

export interface SSEEvent {
  event: string;
  data: unknown;
}

export function createSSEEventSequence(
  discussionId: string,
  agents: MockAgent[]
): SSEEvent[] {
  const host = agents[0];
  const guests = agents.filter((a) => !a.isHost);

  return [
    // Discussion started
    { event: "status_change", data: { status: "running" } },
    { event: "round_change", data: { round_number: 1, topic_focus: "第一轮：开场陈述" } },

    // Host opening (streamed)
    { event: "message", data: { id: "msg-001", agent_id: host.id, agent_name: host.name, round_number: 1, type: "opening", content: "欢迎各位", is_streaming: true } },
    { event: "message", data: { id: "msg-001", agent_id: host.id, agent_name: host.name, round_number: 1, type: "opening", content: "欢迎各位专家来到今天的圆桌讨论。", is_streaming: true } },
    { event: "message_complete", data: { id: "msg-001", content: "欢迎各位专家来到今天的圆桌讨论。今天我们将探讨一个关乎未来的重要话题——人工智能是否会取代人类工作。请各位畅所欲言。", is_streaming: false } },

    // Guest 1 speech
    { event: "message", data: { id: "msg-002", agent_id: guests[0].id, agent_name: guests[0].name, round_number: 1, type: "speech", content: "我认为AI确实会取代", is_streaming: true } },
    { event: "message_complete", data: { id: "msg-002", content: "我认为AI确实会取代部分重复性工作，但这将释放人类创造力，让人类专注于更有价值的事务。", is_streaming: false } },

    // Guest 2 speech
    { event: "message", data: { id: "msg-003", agent_id: guests[1].id, agent_name: guests[1].name, round_number: 1, type: "speech", content: "从法律角度看", is_streaming: true } },
    { event: "message_complete", data: { id: "msg-003", content: "从法律角度看，我们需要为AI时代的劳动法做好准备。现行法律体系尚未充分考虑AI带来的影响。", is_streaming: false } },

    // Guest 3 speech
    { event: "message", data: { id: "msg-004", agent_id: guests[2].id, agent_name: guests[2].name, round_number: 1, type: "speech", content: "技术迭代速度", is_streaming: true } },
    { event: "message_complete", data: { id: "msg-004", content: "技术迭代速度远超社会适应速度，这是最大的挑战。我们需要建立快速响应的治理机制。", is_streaming: false } },

    // Round 1 consensus
    { event: "consensus_new", data: { id: "cons-001", content: "AI将显著改变就业结构，需要提前准备", agreed_agent_ids: guests.slice(0, 3).map((g) => g.id), disagreed_agent_ids: [], round_number: 1 } },

    // Round 2
    { event: "round_change", data: { round_number: 2, topic_focus: "第二轮：深入辩论" } },

    // Guest 1 speech round 2
    { event: "message", data: { id: "msg-005", agent_id: guests[0].id, agent_name: guests[0].name, round_number: 2, type: "speech", content: "我认为政府", is_streaming: true } },
    { event: "message_complete", data: { id: "msg-005", content: "我认为政府不应过度干预AI发展，市场机制会更加高效。", is_streaming: false } },

    // Guest 2 speech round 2
    { event: "message", data: { id: "msg-006", agent_id: guests[1].id, agent_name: guests[1].name, round_number: 2, type: "speech", content: "我不同意", is_streaming: true } },
    { event: "message_complete", data: { id: "msg-006", content: "我不同意。如果没有立法约束，AI发展可能失控，造成严重社会问题。", is_streaming: false } },

    // Round 2 consensus (contested)
    { event: "consensus_new", data: { id: "cons-002", content: "政府是否应通过立法限制AI应用速度", agreed_agent_ids: [guests[1].id], disagreed_agent_ids: [guests[0].id], round_number: 2 } },

    // Final round + closing
    { event: "round_change", data: { round_number: 3, topic_focus: "第三轮：总结陈词" } },

    // Host closing
    { event: "message", data: { id: "msg-007", agent_id: host.id, agent_name: host.name, round_number: 3, type: "closing", content: "经过三轮讨论", is_streaming: true } },
    { event: "message_complete", data: { id: "msg-007", content: "经过三轮深入讨论，我们对AI对就业的影响有了更全面的认识。技术发展不可逆转，人类需要主动适应。", is_streaming: false } },

    // Final summary
    { event: "summary_new", data: { type: "final", content: createMockFinalSummary() } },

    // Status → completed
    { event: "status_change", data: { status: "completed" } },
  ];
}
