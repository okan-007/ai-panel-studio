import { useEffect, useCallback, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranscriptStore } from "../stores/transcriptStore";
import { useAgentStore } from "../stores/agentStore";
import { useDiscussionStore } from "../stores/discussionStore";
import AgentStatusPanel from "../components/agent/AgentStatusPanel";
import TranscriptArea from "../components/studio/TranscriptArea";
import ConsensusPanel from "../components/studio/ConsensusPanel";
import SummaryOverlay from "../components/studio/SummaryOverlay";
import * as api from "../api/client";
import type { DiscussionStatus } from "../types";
import styles from "./StudioPage.module.css";

// ---------------------------------------------------------------------------
// Status indicator helper
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<DiscussionStatus, string> = {
  draft: "草稿",
  ready: "就绪",
  running: "进行中",
  paused: "已暂停",
  completed: "已完成",
  stopped: "已停止",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudioPage() {
  const { discussionId } = useParams<{ discussionId: string }>();
  const navigate = useNavigate();

  // Stores
  const {
    status,
    currentRound,
    maxRounds,
    topicFocus,
    sseConnected,
    summary,
    initDiscussion,
    connectSSE,
    disconnectSSE,
    hydrateMessages,
    hydrateConsensus,
    reset,
  } = useTranscriptStore();

  const { lineup, setLineup, initAgentStatuses, setAgentActivity } =
    useAgentStore();

  const currentDiscussion = useDiscussionStore((s) => s.currentDiscussion);
  const fetchDiscussion = useDiscussionStore((s) => s.fetchDiscussion);
  const updateDiscussionStatus = useDiscussionStore(
    (s) => s.updateDiscussionStatus
  );

  const [confirmAction, setConfirmAction] = useState<{
    action: string;
    label: string;
  } | null>(null);

  // -------------------------------------------------------------------
  // Initialization — load discussion data & establish SSE
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!discussionId) return;

    let cancelled = false;

    const init = async () => {
      // Try sessionStorage first (E2E compat)
      const cached = sessionStorage.getItem(`discussion-${discussionId}`);
      let detail;

      if (cached) {
        try {
          detail = JSON.parse(cached);
        } catch {
          // ignore
        }
      }

      // Fall back to API
      if (!detail) {
        try {
          detail = await api.fetchDiscussion(discussionId);
        } catch {
          // API unavailable — use minimal state
          detail = {
            id: discussionId,
            title: "讨论",
            status: "ready",
            maxRounds: 3,
            currentRound: 0,
            agents: [],
            messages: [],
            consensus_items: [],
          };
        }
      }

      if (cancelled) return;

      // Init transcript store
      initDiscussion({
        discussionId: detail.id,
        status: detail.status,
        currentRound: detail.currentRound,
        maxRounds: detail.maxRounds,
      });

      // Hydrate existing data
      if (detail.messages?.length) hydrateMessages(detail.messages);
      if (detail.consensus_items?.length) hydrateConsensus(detail.consensus_items);

      // Init agent store
      if (detail.agents?.length) {
        const host = detail.agents.find((a: { isHost: boolean }) => a.isHost);
        const guests = detail.agents.filter((a: { isHost: boolean }) => !a.isHost);
        if (host && guests.length > 0) {
          setLineup({ host, guests });
          initAgentStatuses(detail.agents);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [
    discussionId,
    initDiscussion,
    hydrateMessages,
    hydrateConsensus,
    setLineup,
    initAgentStatuses,
  ]);

  // Connect SSE after initialization
  useEffect(() => {
    if (!discussionId) return;

    // Small delay to ensure stores are hydrated
    const timer = setTimeout(() => {
      connectSSE();
    }, 200);

    return () => {
      clearTimeout(timer);
      disconnectSSE();
    };
  }, [discussionId, connectSSE, disconnectSSE]);

  // -------------------------------------------------------------------
  // Track agent activity from SSE message events
  // The transcriptStore handles content; we sync activity here
  // -------------------------------------------------------------------
  useEffect(() => {
    const unsub = useTranscriptStore.subscribe((state, prev) => {
      // Detect new streaming messages
      if (state.messages.length > prev.messages.length) {
        const latest = state.messages[state.messages.length - 1];
        if (latest.isStreaming && latest.agentId) {
          setAgentActivity(latest.agentId, "speaking");
        }
      }

      // Detect completed messages
      for (let i = 0; i < state.messages.length; i++) {
        const curr = state.messages[i];
        const prevMsg = prev.messages[i];
        if (
          prevMsg?.isStreaming &&
          !curr.isStreaming &&
          curr.agentId
        ) {
          useAgentStore.getState().incrementSpeechCount(
            curr.agentId,
            curr.roundNumber
          );
          setAgentActivity(curr.agentId, "done");
        }
      }
    });

    return unsub;
  }, [setAgentActivity]);

  // -------------------------------------------------------------------
  // Discussion control actions
  // -------------------------------------------------------------------
  const handlePause = useCallback(async () => {
    if (!discussionId) return;
    try {
      await api.pauseDiscussion(discussionId);
      updateDiscussionStatus(discussionId, "paused");
    } catch {
      // handled by store
    }
    setConfirmAction(null);
  }, [discussionId, updateDiscussionStatus]);

  const handleResume = useCallback(async () => {
    if (!discussionId) return;
    try {
      await api.resumeDiscussion(discussionId);
      updateDiscussionStatus(discussionId, "running");
    } catch {
      // handled by store
    }
    setConfirmAction(null);
  }, [discussionId, updateDiscussionStatus]);

  const handleStop = useCallback(async () => {
    if (!discussionId) return;
    try {
      await api.stopDiscussion(discussionId);
      updateDiscussionStatus(discussionId, "stopped");
    } catch {
      // handled by store
    }
    setConfirmAction(null);
  }, [discussionId, updateDiscussionStatus]);

  const handleReturnHome = useCallback(() => {
    reset();
    navigate("/");
  }, [reset, navigate]);

  // -------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------
  const agents = lineup ? [lineup.host, ...lineup.guests] : [];
  const title = currentDiscussion?.title ?? topicFocus ?? "演播厅";
  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isEnded = status === "completed" || status === "stopped";

  return (
    <div className={styles.page} data-testid="studio-page">
      {/* ---- Top bar ---- */}
      <div className={styles.topbar} data-testid="studio-topbar">
        <button
          className={styles.backBtn}
          onClick={handleReturnHome}
          data-testid="back-btn"
          title="返回首页"
        >
          ← 返回
        </button>

        <div className={styles.topbarCenter}>
          <h1 className={styles.title} data-testid="studio-title">
            {title}
          </h1>
          <div className={styles.statusRow}>
            <span
              className={`${styles.statusIndicator} ${
                isRunning
                  ? styles.statusRunning
                  : isPaused
                    ? styles.statusPaused
                    : isEnded
                      ? styles.statusEnded
                      : ""
              }`}
              data-testid="studio-status-indicator"
            >
              <span className={styles.statusDot} />
              {STATUS_LABEL[status]}
            </span>
            <span
              className={styles.connection}
              title={sseConnected ? "SSE 已连接" : "SSE 未连接"}
            >
              {sseConnected ? "🟢" : "🔴"}
            </span>
            <span className={styles.roundInfo} data-testid="round-progress">
              第 {currentRound}/{maxRounds} 轮
            </span>
          </div>
        </div>

        <div className={styles.controls}>
          {isRunning && (
            <button
              className={styles.controlBtn}
              onClick={() =>
                setConfirmAction({ action: "pause", label: "暂停讨论" })
              }
              data-testid="pause-btn"
              title="暂停"
            >
              ⏸
            </button>
          )}
          {isPaused && (
            <button
              className={styles.controlBtn}
              onClick={handleResume}
              data-testid="resume-btn"
              title="继续"
            >
              ▶
            </button>
          )}
          {(isRunning || isPaused) && (
            <button
              className={`${styles.controlBtn} ${styles.stopBtn}`}
              onClick={() =>
                setConfirmAction({ action: "stop", label: "停止讨论" })
              }
              data-testid="stop-btn"
              title="停止"
            >
              ⏹
            </button>
          )}
        </div>
      </div>

      {/* ---- Main content ---- */}
      <div className={styles.main}>
        {/* Left: Agent status panel */}
        <AgentStatusPanel
          agents={agents}
          className={styles.leftPanel}
        />

        {/* Right: Transcript + Consensus */}
        <div className={styles.rightPanel}>
          {/* Transcript (upper) */}
          <div className={styles.transcriptWrap}>
            <TranscriptArea />
          </div>

          {/* Consensus (lower) */}
          <div className={styles.consensusWrap}>
            <ConsensusPanel />
          </div>
        </div>
      </div>

      {/* ---- Summary overlay ---- */}
      <SummaryOverlay
        onReturnHome={handleReturnHome}
        onRestart={summary ? undefined : undefined}
      />

      {/* ---- Confirm dialog ---- */}
      {confirmAction && (
        <div
          className={styles.confirmBackdrop}
          data-testid="confirm-dialog"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className={styles.confirmDialog}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={styles.confirmText}>
              确认{confirmAction.label}？
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.confirmCancel}
                onClick={() => setConfirmAction(null)}
                data-testid="confirm-dialog-cancel"
              >
                取消
              </button>
              <button
                className={styles.confirmOk}
                onClick={
                  confirmAction.action === "pause"
                    ? handlePause
                    : confirmAction.action === "stop"
                      ? handleStop
                      : handleResume
                }
                data-testid="confirm-dialog-confirm"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
