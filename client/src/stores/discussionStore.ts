/**
 * Zustand store for discussion list & CRUD operations.
 */

import { create } from "zustand";
import type { Discussion, DiscussionDetail, DiscussionStatus } from "../types";
import * as api from "../api/client";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface DiscussionState {
  // Data
  discussions: Discussion[];
  total: number;
  currentDiscussion: DiscussionDetail | null;

  // Filters
  statusFilter: DiscussionStatus | "all";
  searchQuery: string;

  // Loading
  loading: boolean;
  error: string | null;

  // Actions
  fetchDiscussions: () => Promise<void>;
  fetchDiscussion: (id: string) => Promise<void>;
  createDiscussion: (input: {
    topic: string;
    guestCount: number;
    background?: string;
    template?: string;
    maxRounds?: number;
  }) => Promise<DiscussionDetail>;
  deleteDiscussion: (id: string) => Promise<void>;
  setStatusFilter: (status: DiscussionStatus | "all") => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
  updateDiscussionStatus: (id: string, status: DiscussionStatus) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDiscussionStore = create<DiscussionState>((set, get) => ({
  discussions: [],
  total: 0,
  currentDiscussion: null,
  statusFilter: "all",
  searchQuery: "",
  loading: false,
  error: null,

  // -------------------------------------------------------------------
  // Fetch list
  // -------------------------------------------------------------------
  fetchDiscussions: async () => {
    const { statusFilter, searchQuery } = get();
    set({ loading: true, error: null });
    try {
      const res = await api.fetchDiscussions({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchQuery || undefined,
      });
      set({ discussions: res.data, total: res.total, loading: false });
    } catch (err) {
      const message =
        err instanceof api.ApiClientError ? err.message : "加载讨论列表失败";
      set({ error: message, loading: false });
    }
  },

  // -------------------------------------------------------------------
  // Fetch detail
  // -------------------------------------------------------------------
  fetchDiscussion: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const detail = await api.fetchDiscussion(id);
      set({ currentDiscussion: detail, loading: false });
    } catch (err) {
      const message =
        err instanceof api.ApiClientError ? err.message : "加载讨论详情失败";
      set({ error: message, loading: false });
    }
  },

  // -------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------
  createDiscussion: async (input) => {
    set({ loading: true, error: null });
    try {
      const detail = await api.createDiscussion(input);
      // Prepend to list
      const listItem: Discussion = {
        id: detail.id,
        title: detail.title,
        background: detail.background,
        status: detail.status,
        maxRounds: detail.maxRounds,
        currentRound: detail.currentRound,
        agentCount: detail.agentCount,
        speechCount: detail.speechCount,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      };
      set((s) => ({
        discussions: [listItem, ...s.discussions],
        total: s.total + 1,
        loading: false,
      }));
      return detail;
    } catch (err) {
      const message =
        err instanceof api.ApiClientError ? err.message : "创建讨论失败";
      set({ error: message, loading: false });
      throw err;
    }
  },

  // -------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------
  deleteDiscussion: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.deleteDiscussion(id);
      set((s) => ({
        discussions: s.discussions.filter((d) => d.id !== id),
        total: s.total - 1,
        currentDiscussion:
          s.currentDiscussion?.id === id ? null : s.currentDiscussion,
        loading: false,
      }));
    } catch (err) {
      const message =
        err instanceof api.ApiClientError ? err.message : "删除讨论失败";
      set({ error: message, loading: false });
    }
  },

  // -------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------
  setStatusFilter: (status) => {
    set({ statusFilter: status });
  },
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
  clearError: () => set({ error: null }),

  // -------------------------------------------------------------------
  // Optimistic status update
  // -------------------------------------------------------------------
  updateDiscussionStatus: (id, status) => {
    set((s) => ({
      discussions: s.discussions.map((d) =>
        d.id === id ? { ...d, status, updatedAt: new Date().toISOString() } : d
      ),
      currentDiscussion:
        s.currentDiscussion?.id === id
          ? { ...s.currentDiscussion, status }
          : s.currentDiscussion,
    }));
  },
}));
