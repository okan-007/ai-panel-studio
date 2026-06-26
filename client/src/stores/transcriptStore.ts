/**
 * Zustand store for transcript (messages), consensus/disagreement items,
 * and discussion lifecycle state driven by SSE events.
 */

import { create } from "zustand";
import type {
  Message,
  ConsensusItem,
  DiscussionStatus,
  SSEStatusChangeData,
  SSERoundChangeData,
  SSEMessageData,
  SSEMessageCompleteData,
  SSEConsensusNewData,
  SSESummaryNewData,
  SSEErrorData,
} from "../types";
import { SSEConnection } from "../api/sse";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface TranscriptState {
  // Discussion lifecycle
  discussionId: string | null;
  status: DiscussionStatus;
  currentRound: number;
  maxRounds: number;
  topicFocus: string;

  // Data
  messages: Message[];
  consensusItems: ConsensusItem[];
  summary: string | null;

  // SSE connection
  sse: SSEConnection | null;
  sseConnected: boolean;
  sseError: string | null;

  // UI state
  loading: boolean;
  error: string | null;

  // Actions — lifecycle
  initDiscussion: (params: {
    discussionId: string;
    status?: DiscussionStatus;
    currentRound?: number;
    maxRounds?: number;
    topicFocus?: string;
  }) => void;
  connectSSE: () => void;
  disconnectSSE: () => void;
  reset: () => void;

  // Actions — data hydration (from API or session)
  hydrateMessages: (messages: Message[]) => void;
  hydrateConsensus: (items: ConsensusItem[]) => void;

  // Actions — SSE event handlers
  handleStatusChange: (data: SSEStatusChangeData) => void;
  handleRoundChange: (data: SSERoundChangeData) => void;
  handleMessage: (data: SSEMessageData) => void;
  handleMessageComplete: (data: SSEMessageCompleteData) => void;
  handleConsensusNew: (data: SSEConsensusNewData) => void;
  handleSummaryNew: (data: SSESummaryNewData) => void;
  handleError: (data: SSEErrorData) => void;
  setSseConnected: (connected: boolean) => void;

  // Computed helpers
  getAgreedItems: () => ConsensusItem[];
  getContestedItems: () => ConsensusItem[];
  getMessagesByRound: (round: number) => Message[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  discussionId: null,
  status: "ready",
  currentRound: 0,
  maxRounds: 3,
  topicFocus: "",

  messages: [],
  consensusItems: [],
  summary: null,

  sse: null,
  sseConnected: false,
  sseError: null,

  loading: false,
  error: null,

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------
  initDiscussion: ({ discussionId, status, currentRound, maxRounds, topicFocus }) => {
    // Disconnect any existing SSE
    get().sse?.disconnect();

    set({
      discussionId,
      status: status ?? "ready",
      currentRound: currentRound ?? 0,
      maxRounds: maxRounds ?? 3,
      topicFocus: topicFocus ?? "",
      messages: [],
      consensusItems: [],
      summary: null,
      sse: new SSEConnection(discussionId),
      sseConnected: false,
      sseError: null,
      loading: false,
      error: null,
    });
  },

  connectSSE: () => {
    const { sse } = get();
    if (!sse) return;

    // Register handlers
    sse.on({
      onStatusChange: (d) => get().handleStatusChange(d),
      onRoundChange: (d) => get().handleRoundChange(d),
      onMessage: (d) => get().handleMessage(d),
      onMessageComplete: (d) => get().handleMessageComplete(d),
      onConsensusNew: (d) => get().handleConsensusNew(d),
      onSummaryNew: (d) => get().handleSummaryNew(d),
      onError: (d) => get().handleError(d),
      onConnectionChange: (connected) => get().setSseConnected(connected),
    });

    sse.connect();
  },

  disconnectSSE: () => {
    get().sse?.disconnect();
    set({ sseConnected: false });
  },

  reset: () => {
    get().sse?.disconnect();
    set({
      discussionId: null,
      status: "ready",
      currentRound: 0,
      maxRounds: 3,
      topicFocus: "",
      messages: [],
      consensusItems: [],
      summary: null,
      sse: null,
      sseConnected: false,
      sseError: null,
      loading: false,
      error: null,
    });
  },

  // -------------------------------------------------------------------
  // Data hydration
  // -------------------------------------------------------------------
  hydrateMessages: (messages) => set({ messages }),
  hydrateConsensus: (items) => set({ consensusItems: items }),

  // -------------------------------------------------------------------
  // SSE event handlers
  // -------------------------------------------------------------------
  handleStatusChange: (data) => {
    set({ status: data.status });
  },

  handleRoundChange: (data) => {
    set({
      currentRound: data.round_number,
      topicFocus: data.topic_focus,
    });
  },

  handleMessage: (data) => {
    const existingIndex = get().messages.findIndex((m) => m.id === data.id);

    if (existingIndex >= 0) {
      // Update streaming message in-place
      set((s) => {
        const next = [...s.messages];
        next[existingIndex] = {
          ...next[existingIndex],
          content: data.content,
          isStreaming: data.is_streaming,
        };
        return { messages: next };
      });
    } else {
      // New message
      const now = new Date().toISOString();
      const newMsg: Message = {
        id: data.id,
        agentId: data.agent_id,
        agentName: data.agent_name,
        agentRole: data.agent_role ?? "",
        agentColor: data.agent_color ?? "#6B7280",
        roundNumber: data.round_number,
        type: data.type,
        content: data.content,
        isStreaming: data.is_streaming,
        createdAt: now,
      };
      set((s) => ({
        messages: [...s.messages, newMsg],
      }));
    }
  },

  handleMessageComplete: (data) => {
    const idx = get().messages.findIndex((m) => m.id === data.id);
    if (idx >= 0) {
      set((s) => {
        const next = [...s.messages];
        next[idx] = {
          ...next[idx],
          content: data.content,
          isStreaming: false,
        };
        return { messages: next };
      });
    }
  },

  handleConsensusNew: (data) => {
    // Avoid duplicates by ID
    if (get().consensusItems.some((c) => c.id === data.id)) return;

    const newItem: ConsensusItem = {
      id: data.id,
      content: data.content,
      agreedAgentIds: data.agreed_agent_ids,
      disagreedAgentIds: data.disagreed_agent_ids,
      roundNumber: data.round_number,
      status:
        data.disagreed_agent_ids.length > 0 ? "contested" : "agreed",
    };

    set((s) => ({
      consensusItems: [...s.consensusItems, newItem],
    }));
  },

  handleSummaryNew: (data) => {
    set({ summary: data.content });
  },

  handleError: (data) => {
    set({ sseError: data.message });
  },

  setSseConnected: (connected) => {
    set({ sseConnected: connected });
  },

  // -------------------------------------------------------------------
  // Computed helpers
  // -------------------------------------------------------------------
  getAgreedItems: () => {
    return get().consensusItems.filter(
      (c) => c.status === "agreed" || c.status === "proposed"
    );
  },

  getContestedItems: () => {
    return get().consensusItems.filter((c) => c.status === "contested");
  },

  getMessagesByRound: (round) => {
    return get().messages.filter((m) => m.roundNumber === round);
  },
}));
