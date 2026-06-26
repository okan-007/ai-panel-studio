/**
 * Zustand store for agent lineup & per-agent status during a discussion.
 */

import { create } from "zustand";
import type { Agent, AgentLineup, AgentStatus, AgentActivityStatus, LineupGenerationInput } from "../types";
import * as api from "../api/client";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AgentState {
  // Lineup
  lineup: AgentLineup | null;
  lineupLoading: boolean;
  lineupError: string | null;

  // Per-agent runtime status
  agentStatuses: Map<string, AgentStatus>;

  // Actions — lineup
  generateLineup: (input: {
    topic: string;
    guestCount: number;
    background?: string;
    template?: string;
  }) => Promise<AgentLineup>;
  setLineup: (lineup: AgentLineup) => void;
  clearLineup: () => void;

  // Actions — status
  initAgentStatuses: (agents: Agent[]) => void;
  setAgentActivity: (agentId: string, activity: AgentActivityStatus) => void;
  incrementSpeechCount: (agentId: string, roundNumber: number) => void;
  getAgentStatus: (agentId: string) => AgentStatus | undefined;
  resetAllStatuses: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAgentStore = create<AgentState>((set, get) => ({
  lineup: null,
  lineupLoading: false,
  lineupError: null,
  agentStatuses: new Map(),

  // -------------------------------------------------------------------
  // Lineup generation
  // -------------------------------------------------------------------
  generateLineup: async (input) => {
    set({ lineupLoading: true, lineupError: null });
    try {
      const lineup = await api.generateLineup({
        topic: input.topic,
        guestCount: input.guestCount,
        background: input.background,
        template: input.template as LineupGenerationInput["template"],
      });
      set({ lineup, lineupLoading: false });
      return lineup;
    } catch (err) {
      const message =
        err instanceof api.ApiClientError ? err.message : "生成阵容失败";
      set({ lineupError: message, lineupLoading: false });
      throw err;
    }
  },

  setLineup: (lineup) => set({ lineup }),

  clearLineup: () => set({ lineup: null, agentStatuses: new Map() }),

  // -------------------------------------------------------------------
  // Agent status
  // -------------------------------------------------------------------
  initAgentStatuses: (agents) => {
    const statuses = new Map<string, AgentStatus>();
    for (const agent of agents) {
      statuses.set(agent.id, {
        agentId: agent.id,
        activity: "idle",
        speechCount: 0,
        lastRound: 0,
      });
    }
    set({ agentStatuses: statuses });
  },

  setAgentActivity: (agentId, activity) => {
    set((s) => {
      const next = new Map(s.agentStatuses);
      const current = next.get(agentId);
      if (current) {
        next.set(agentId, { ...current, activity });
      } else {
        next.set(agentId, {
          agentId,
          activity,
          speechCount: 0,
          lastRound: 0,
        });
      }
      return { agentStatuses: next };
    });
  },

  incrementSpeechCount: (agentId, roundNumber) => {
    set((s) => {
      const next = new Map(s.agentStatuses);
      const current = next.get(agentId);
      if (current) {
        next.set(agentId, {
          ...current,
          speechCount: current.speechCount + 1,
          lastRound: roundNumber,
          activity: "done",
        });
      }
      return { agentStatuses: next };
    });
  },

  getAgentStatus: (agentId) => get().agentStatuses.get(agentId),

  resetAllStatuses: () => set({ agentStatuses: new Map() }),
}));
