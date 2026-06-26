// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

export interface Agent {
  id: string;
  name: string;
  title: string;
  stance: string;
  color: string;
  isHost: boolean;
  sortOrder: number;
}

export interface AgentLineup {
  host: Agent;
  guests: Agent[];
}

export interface LineupGenerationInput {
  topic: string;
  guestCount: number;
  background?: string;
  template?: "debate" | "roundtable" | "expert-panel";
}

// ---------------------------------------------------------------------------
// Discussion types
// ---------------------------------------------------------------------------

export type DiscussionStatus =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "stopped";

export interface Discussion {
  id: string;
  title: string;
  background: string;
  status: DiscussionStatus;
  maxRounds: number;
  currentRound: number;
  agentCount: number;
  speechCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiscussionDetail extends Discussion {
  agents: Agent[];
  messages: Message[];
  consensus_items: ConsensusItem[];
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export type MessageType = "opening" | "speech" | "closing" | "system" | "thinking";

export interface Message {
  id: string;
  agentId: string | null;
  agentName: string;
  agentRole: string;
  agentColor: string;
  roundNumber: number;
  type: MessageType;
  content: string;
  isStreaming: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Consensus types
// ---------------------------------------------------------------------------

export type ConsensusStatus = "proposed" | "agreed" | "contested";

export interface ConsensusItem {
  id: string;
  content: string;
  agreedAgentIds: string[];
  disagreedAgentIds: string[];
  roundNumber: number;
  status: ConsensusStatus;
}

// ---------------------------------------------------------------------------
// Summary types
// ---------------------------------------------------------------------------

export interface Summary {
  id: string;
  type: "final" | "round";
  roundNumber: number | null;
  content: string;
}

// ---------------------------------------------------------------------------
// SSE Event types
// ---------------------------------------------------------------------------

export type SSEEventType =
  | "status_change"
  | "round_change"
  | "message"
  | "message_complete"
  | "consensus_new"
  | "summary_new"
  | "error";

export interface SSEStatusChangeData {
  status: DiscussionStatus;
}

export interface SSERoundChangeData {
  round_number: number;
  topic_focus: string;
}

export interface SSEMessageData {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_role?: string;
  agent_color?: string;
  round_number: number;
  type: MessageType;
  content: string;
  is_streaming: boolean;
}

export interface SSEMessageCompleteData {
  id: string;
  content: string;
  is_streaming: false;
}

export interface SSEConsensusNewData {
  id: string;
  content: string;
  agreed_agent_ids: string[];
  disagreed_agent_ids: string[];
  round_number: number;
}

export interface SSESummaryNewData {
  type: "final" | "round";
  content: string;
}

export interface SSEErrorData {
  code: string;
  message: string;
}

export type SSEData =
  | SSEStatusChangeData
  | SSERoundChangeData
  | SSEMessageData
  | SSEMessageCompleteData
  | SSEConsensusNewData
  | SSESummaryNewData
  | SSEErrorData;

// ---------------------------------------------------------------------------
// Agent status (UI-specific)
// ---------------------------------------------------------------------------

export type AgentActivityStatus =
  | "idle"       // 待机
  | "thinking"   // 思考中
  | "speaking"   // 发言中
  | "done";      // 已发言

export interface AgentStatus {
  agentId: string;
  activity: AgentActivityStatus;
  speechCount: number;
  lastRound: number;
}

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

export interface ApiListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  error: string;
}
