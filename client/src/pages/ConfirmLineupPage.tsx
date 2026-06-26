import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAgentStore } from "../stores/agentStore";
import { useDiscussionStore } from "../stores/discussionStore";
import { useTranscriptStore } from "../stores/transcriptStore";
import AgentCard from "../components/agent/AgentCard";
import * as api from "../api/client";
import styles from "./ConfirmLineupPage.module.css";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConfirmLineupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const discussionId = searchParams.get("discussionId");

  const { lineup, setLineup, lineupLoading, lineupError } = useAgentStore();
  const currentDiscussion = useDiscussionStore((s) => s.currentDiscussion);
  const fetchDiscussion = useDiscussionStore((s) => s.fetchDiscussion);
  const initDiscussion = useTranscriptStore((s) => s.initDiscussion);

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If we have a discussionId, load its detail; otherwise check sessionStorage
  useEffect(() => {
    if (discussionId) {
      fetchDiscussion(discussionId);
    } else {
      // Try to recover from sessionStorage (for E2E tests)
      const cached = sessionStorage.getItem("pendingLineup");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.host && parsed.guests) {
            setLineup({ host: parsed.host, guests: parsed.guests });
          }
        } catch {
          // ignore
        }
      }
    }
  }, [discussionId, fetchDiscussion, setLineup]);

  // When detail loads, set lineup
  useEffect(() => {
    if (currentDiscussion?.agents && currentDiscussion.agents.length > 0) {
      const host = currentDiscussion.agents.find((a) => a.isHost);
      const guests = currentDiscussion.agents.filter((a) => !a.isHost);
      if (host && guests.length > 0) {
        setLineup({ host, guests });
      }
    }
  }, [currentDiscussion, setLineup]);

  const topic = currentDiscussion?.title ?? "未命名讨论";

  const handleConfirm = async () => {
    if (!lineup || !currentDiscussion) return;

    setConfirming(true);
    setError(null);

    try {
      // Start the discussion
      await api.startDiscussion(currentDiscussion.id);

      // Initialize transcript store
      initDiscussion({
        discussionId: currentDiscussion.id,
        status: "running",
        currentRound: 0,
        maxRounds: currentDiscussion.maxRounds,
      });

      // Navigate to studio
      navigate(`/studio/${currentDiscussion.id}`);
    } catch (err) {
      setError(
        err instanceof api.ApiClientError ? err.message : "启动讨论失败"
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleRegenerate = async () => {
    if (!currentDiscussion) return;

    setLineup(null!); // Force loading state
    try {
      const newLineup = await api.generateLineup({
        topic: currentDiscussion.title,
        guestCount: currentDiscussion.agentCount,
        background: currentDiscussion.background || undefined,
      });
      setLineup(newLineup);
    } catch (err) {
      setError(
        err instanceof api.ApiClientError ? err.message : "重新生成阵容失败"
      );
    }
  };

  const agents = lineup ? [lineup.host, ...lineup.guests] : [];

  return (
    <div className={styles.page} data-testid="lineup-page">
      {/* Topic banner */}
      <div className={styles.banner} data-testid="topic-banner">
        <p className={styles.bannerLabel}>讨论话题</p>
        <h1 className={styles.bannerTopic} data-testid="topic-banner-text">
          {topic}
        </h1>
        {currentDiscussion?.background && (
          <p className={styles.bannerBg}>{currentDiscussion.background}</p>
        )}
      </div>

      {/* Loading */}
      {lineupLoading && (
        <div className={styles.loading} data-testid="lineup-loading">
          <div className={styles.spinner} />
          <p>AI 正在生成专家阵容...</p>
        </div>
      )}

      {/* Error */}
      {(lineupError || error) && (
        <div className={styles.errorBanner} data-testid="error-banner">
          {lineupError || error}
        </div>
      )}

      {/* Agent lineup */}
      {lineup && !lineupLoading && (
        <>
          {/* Host */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>主持人</h2>
            <div className={styles.hostGrid}>
              <AgentCard agent={lineup.host} isHost />
            </div>
          </section>

          {/* Guests */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              专家嘉宾 ({lineup.guests.length} 位)
            </h2>
            <div className={styles.guestGrid}>
              {lineup.guests.map((guest) => (
                <AgentCard key={guest.id} agent={guest} />
              ))}
            </div>
          </section>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              className={styles.regenerateBtn}
              onClick={handleRegenerate}
              data-testid="regenerate-btn"
            >
              重新生成
            </button>
            <button
              className={styles.confirmBtn}
              onClick={handleConfirm}
              disabled={confirming}
              data-testid="confirm-lineup-btn"
            >
              {confirming ? "启动中..." : "确认并进入演播厅"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
