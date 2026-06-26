import { useAgentStore } from "../../stores/agentStore";
import AgentStatusCard from "./AgentStatusCard";
import type { Agent } from "../../types";
import styles from "./AgentStatusPanel.module.css";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentStatusPanelProps {
  agents: Agent[];
  className?: string;
}

export default function AgentStatusPanel({
  agents,
  className,
}: AgentStatusPanelProps) {
  const agentStatuses = useAgentStore((s) => s.agentStatuses);

  const host = agents.find((a) => a.isHost);
  const guests = agents.filter((a) => !a.isHost);

  return (
    <aside
      className={`${styles.panel} ${className ?? ""}`}
      data-testid="agent-status-panel"
    >
      <div className={styles.header}>
        <h3 className={styles.title}>专家状态</h3>
        <span className={styles.count}>{agents.length} 人</span>
      </div>

      <div className={styles.list}>
        {/* Host first */}
        {host && (
          <AgentStatusCard
            key={host.id}
            agent={host}
            activity={agentStatuses.get(host.id)?.activity ?? "idle"}
            speechCount={agentStatuses.get(host.id)?.speechCount ?? 0}
          />
        )}

        {/* Guests */}
        {guests.map((agent) => (
          <AgentStatusCard
            key={agent.id}
            agent={agent}
            activity={agentStatuses.get(agent.id)?.activity ?? "idle"}
            speechCount={agentStatuses.get(agent.id)?.speechCount ?? 0}
          />
        ))}
      </div>
    </aside>
  );
}
