import type { Agent } from "../../types";
import styles from "./AgentCard.module.css";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentCardProps {
  agent: Agent;
  isHost?: boolean;
}

export default function AgentCard({ agent, isHost = false }: AgentCardProps) {
  const color = agent.color || "#6B7280";

  return (
    <div
      className={`${styles.card} ${isHost ? styles.hostCard : ""}`}
      data-testid={isHost ? "host-card" : "agent-card"}
    >
      {/* Color accent top bar */}
      <div
        className={styles.colorBar}
        style={{ backgroundColor: color }}
        data-testid="agent-card-color"
      />

      <div className={styles.body}>
        {/* Avatar */}
        <div
          className={styles.avatar}
          style={{
            backgroundColor: `${color}22`,
            borderColor: color,
          }}
        >
          <span className={styles.avatarText} style={{ color }}>
            {agent.name.charAt(0)}
          </span>
        </div>

        {/* Info */}
        <div className={styles.info}>
          <h3 className={styles.name} data-testid="agent-card-name">
            {agent.name}
            {isHost && <span className={styles.hostBadge}>主持人</span>}
          </h3>
          <p className={styles.title} data-testid="agent-card-title">
            {agent.title}
          </p>
          <p className={styles.stance} data-testid="agent-card-stance">
            {agent.stance}
          </p>
        </div>
      </div>

      {/* Role indicator */}
      <div
        className={styles.roleIndicator}
        style={{ color }}
      >
        {isHost ? "🎤" : agent.sortOrder < 3 ? "⭐" : "💬"}
      </div>
    </div>
  );
}
