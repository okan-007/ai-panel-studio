/**
 * REST API client for the AI Panel Studio backend.
 *
 * All endpoints return typed responses.  Errors are thrown as `ApiClientError`.
 */

import type {
  Discussion,
  DiscussionDetail,
  AgentLineup,
  LineupGenerationInput,
  Message,
  ConsensusItem,
  Summary,
  ApiListResponse,
} from "../types";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body.error ?? body.message ?? message;
      code = body.code;
    } catch {
      // ignore parse errors
    }
    throw new ApiClientError(message, res.status, code);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Discussions
// ---------------------------------------------------------------------------

export async function fetchDiscussions(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<ApiListResponse<Discussion>> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const qs = searchParams.toString();
  return request<ApiListResponse<Discussion>>(
    `/discussions${qs ? `?${qs}` : ""}`
  );
}

export async function fetchDiscussion(
  id: string
): Promise<DiscussionDetail> {
  return request<DiscussionDetail>(`/discussions/${id}`);
}

export async function createDiscussion(input: {
  topic: string;
  guestCount: number;
  background?: string;
  template?: string;
  maxRounds?: number;
}): Promise<DiscussionDetail> {
  return request<DiscussionDetail>("/discussions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteDiscussion(id: string): Promise<void> {
  return request<void>(`/discussions/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Lineup
// ---------------------------------------------------------------------------

export async function generateLineup(
  input: LineupGenerationInput
): Promise<AgentLineup> {
  return request<AgentLineup>("/discussions/generate-lineup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Discussion control
// ---------------------------------------------------------------------------

export async function startDiscussion(id: string): Promise<{
  message: string;
  status: string;
  current_round: number;
}> {
  return request(`/discussions/${id}/start`, { method: "POST" });
}

export async function pauseDiscussion(id: string): Promise<{
  message: string;
  status: string;
}> {
  return request(`/discussions/${id}/pause`, { method: "POST" });
}

export async function resumeDiscussion(id: string): Promise<{
  message: string;
  status: string;
}> {
  return request(`/discussions/${id}/resume`, { method: "POST" });
}

export async function stopDiscussion(id: string): Promise<{
  message: string;
  status: string;
}> {
  return request(`/discussions/${id}/stop`, { method: "POST" });
}

export async function nextRound(id: string): Promise<{
  message: string;
  status: string;
  current_round: number;
}> {
  return request(`/discussions/${id}/next-round`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export async function fetchMessages(
  id: string
): Promise<ApiListResponse<Message>> {
  return request<ApiListResponse<Message>>(`/discussions/${id}/messages`);
}

// ---------------------------------------------------------------------------
// Consensus
// ---------------------------------------------------------------------------

export async function fetchConsensus(
  id: string
): Promise<ApiListResponse<ConsensusItem>> {
  return request<ApiListResponse<ConsensusItem>>(
    `/discussions/${id}/consensus`
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function fetchSummaries(
  id: string
): Promise<ApiListResponse<Summary>> {
  return request<ApiListResponse<Summary>>(`/discussions/${id}/summaries`);
}
