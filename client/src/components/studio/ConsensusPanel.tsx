import { useTranscriptStore } from "../../stores/transcriptStore";
import { useAgentStore } from "../../stores/agentStore";
import type { ConsensusItem } from "../../types";
import styles from "./ConsensusPanel.module.css";

// ---------------------------------------------------------------------------
// Single consensus item row
// ---------------------------------------------------------------------------

function ConsensusRow({
  item,
  isAgreed,
}: {
  item: ConsensusItem;
  isAgreed: boolean;
}) {
  const lineup = useAgentStore((s) => s.lineup);
  const allAgents = lineup
    ? [lineup.host, ...lineup.guests]
    : [];

  const agentNameById = (id: string): string => {
    return allAgents.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  };

  return (
    <div
      className={`${styles.item} ${isAgreed ? styles.agreed : styles.contested}`}
      data-testid={isAgreed ? "consensus-item" : "disagreement-item"}
    >
      {/* Status icon */}
      <span className={styles.icon}>{isAgreed ? "✅" : "⚡"}</span>

      {/* Content */}
      <div className={styles.body}>
        <p className={styles.content}>{item.content}</p>

        <div className={styles.agents}>
          {item.agreedAgentIds.length > 0 && (
            <span className={styles.agreeLabel}>
              同意：{item.agreedAgentIds.map(agentNameById).join("、")}
            </span>
          )}
          {item.disagreedAgentIds.length > 0 && (
            <span className={styles.disagreeLabel}>
              反对：{item.disagreedAgentIds.map(agentNameById).join("、")}
            </span>
          )}
        </div>
      </div>

      {/* Round badge */}
      <span className={styles.round}>R{item.roundNumber}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ConsensusPanel() {
  const consensusItems = useTranscriptStore((s) => s.consensusItems);
  const getAgreedItems = useTranscriptStore((s) => s.getAgreedItems);
  const getContestedItems = useTranscriptStore((s) => s.getContestedItems);

  const agreed = getAgreedItems();
  const contested = getContestedItems();
  const isEmpty = consensusItems.length === 0;

  return (
    <div className={styles.panel}>
      {/* Consensus (left) */}
      <div
        className={`${styles.column} ${styles.consensusCol}`}
        data-testid="consensus-panel"
      >
        <div className={styles.colHeader}>
          <h4 className={styles.colTitle}>已达成共识</h4>
          <span className={styles.colCount}>{agreed.length}</span>
        </div>

        <div className={styles.colBody}>
          {isEmpty ? (
            <p className={styles.empty}>等待讨论推进...</p>
          ) : agreed.length === 0 ? (
            <p className={styles.empty}>暂无共识</p>
          ) : (
            agreed.map((item) => (
              <ConsensusRow key={item.id} item={item} isAgreed />
            ))
          )}
        </div>
      </div>

      {/* Disagreement (right) */}
      <div
        className={`${styles.column} ${styles.disagreeCol}`}
        data-testid="disagreement-panel"
      >
        <div className={styles.colHeader}>
          <h4 className={styles.colTitle}>仍存分歧</h4>
          <span className={`${styles.colCount} ${styles.disagreeCount}`}>
            {contested.length}
          </span>
        </div>

        <div className={styles.colBody}>
          {isEmpty ? (
            <p className={styles.empty}>等待讨论推进...</p>
          ) : contested.length === 0 ? (
            <p className={styles.empty}>暂无分歧</p>
          ) : (
            contested.map((item) => (
              <ConsensusRow key={item.id} item={item} isAgreed={false} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
