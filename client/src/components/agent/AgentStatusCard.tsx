import type { Agent, AgentActivityStatus } from "../../types";
import styles from "./AgentStatusCard.module.css";

// ---------------------------------------------------------------------------
// Activity config
// ---------------------------------------------------------------------------

const ACTIVITY_CONFIG: Record<
  AgentActivityStatus,
  { label: string; className: string; indicator: string }
> = {
  idle: { label: "待机", className: "idle", indicator: "○" },
  thinking: { label: "思考中", className: "thinking", indicator: "◉" },
  speaking: { label: "发言中", className: "speaking", indicator: "●" },
  done: { label: "已发言", className: "done", indicator: "◉" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentStatusCardProps {
  agent: Agent;
  activity?: AgentActivityStatus;
  speechCount?: number;
}

export default function AgentStatusCard({
  agent,
  activity = "idle",
  speechCount = 0,
}: AgentStatusCardProps) {
  const cfg = ACTIVITY_CONFIG[activity];
  const color = agent.color || "#6B7280";

  return (
    <div
      className={`${styles.card} ${styles[cfg.className]}`}
      data-testid="agent-status-card"
    >
      {/* Status indicator dot */}
      <div className={styles.indicator}>
        <span
          className={`${styles.dot} ${styles[cfg.className]}`}
          style={
            activity === "speaking" || activity === "thinking"
              ? { color, borderColor: color }
              : undefined
          }
        >
          {cfg.indicator}
        </span>
        <span
          className={styles.label}
          data-testid="agent-status-label"
          style={activity === "speaking" ? { color } : undefined}
        >
          {cfg.label}
        </span>
      </div>

      {/* Agent info */}
      <div className={styles.info}>
        <div className={styles.avatar} style={{ backgroundColor: `${color}22` }}>
          <span style={{ color }}>{agent.name.charAt(0)}</span>
        </div>
        <div className={styles.text}>
          <p className={styles.name}>{agent.name}</p>
          <p className={styles.role}>
            {agent.isHost ? "主持人" : agent.title}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <span className={styles.stat}>
          发言 <strong>{speechCount}</strong>
        </span>
      </div>
    </div>
  );
}
