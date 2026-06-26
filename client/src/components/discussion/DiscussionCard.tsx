import { useNavigate } from "react-router-dom";
import type { Discussion, DiscussionStatus } from "../../types";
import styles from "./DiscussionCard.module.css";

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  DiscussionStatus,
  { label: string; className: string }
> = {
  draft: { label: "草稿", className: "statusDraft" },
  ready: { label: "就绪", className: "statusReady" },
  running: { label: "进行中", className: "statusRunning" },
  paused: { label: "已暂停", className: "statusPaused" },
  completed: { label: "已完成", className: "statusCompleted" },
  stopped: { label: "已停止", className: "statusStopped" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHr < 24) return `${diffHr} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString("zh-CN");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DiscussionCardProps {
  discussion: Discussion;
}

export default function DiscussionCard({ discussion }: DiscussionCardProps) {
  const navigate = useNavigate();
  const statusCfg = STATUS_CONFIG[discussion.status];

  const handleClick = () => {
    if (discussion.status === "draft") {
      // Draft discussions: navigate to lineup to complete setup
      navigate(`/lineup?discussionId=${discussion.id}`);
    } else {
      navigate(`/studio/${discussion.id}`);
    }
  };

  return (
    <article
      className={styles.card}
      data-testid="discussion-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
    >
      {/* Status badge */}
      <div className={styles.topRow}>
        <span
          className={`${styles.status} ${styles[statusCfg.className]}`}
          data-testid="discussion-card-status"
        >
          {statusCfg.label}
        </span>
        <span className={styles.time}>{formatTime(discussion.updatedAt)}</span>
      </div>

      {/* Title */}
      <h3 className={styles.title} data-testid="discussion-card-title">
        {discussion.title}
      </h3>

      {/* Background (truncated) */}
      {discussion.background && (
        <p className={styles.background}>{discussion.background}</p>
      )}

      {/* Meta row */}
      <div className={styles.meta}>
        <span data-testid="discussion-card-agent-count">
          {discussion.agentCount} 位嘉宾
        </span>
        <span className={styles.dot}>·</span>
        <span data-testid="discussion-card-progress">
          第 {discussion.currentRound}/{discussion.maxRounds} 轮
        </span>
        <span className={styles.dot}>·</span>
        <span>{discussion.speechCount} 条发言</span>
      </div>
    </article>
  );
}
