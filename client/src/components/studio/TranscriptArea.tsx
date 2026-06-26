import { useEffect, useRef } from "react";
import { useTranscriptStore } from "../../stores/transcriptStore";
import type { Message } from "../../types";
import styles from "./TranscriptArea.module.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Single message row
// ---------------------------------------------------------------------------

function MessageRow({ message }: { message: Message }) {
  const color = message.agentColor || "#6B7280";
  const isStreaming = message.isStreaming;

  return (
    <div
      className={`${styles.message} ${isStreaming ? styles.streaming : ""}`}
      data-testid="transcript-message"
    >
      {/* Agent header */}
      <div
        className={styles.msgHeader}
        data-testid="message-header"
        style={{ borderLeftColor: color }}
      >
        <span className={styles.agentName} style={{ color }}>
          {message.agentName}
        </span>
        <span className={styles.agentRole}>{message.agentRole}</span>
        <span className={styles.msgType}>
          {message.type === "opening"
            ? "开场"
            : message.type === "closing"
              ? "总结"
              : message.type === "system"
                ? "系统"
                : message.type === "thinking"
                  ? "思考"
                  : "发言"}
        </span>
      </div>

      {/* Content */}
      <div className={styles.msgContent} data-testid="message-content">
        <p>
          {message.content}
          {isStreaming && <span className={styles.cursor}>▍</span>}
        </p>
      </div>

      {/* Timestamp */}
      <time
        className={styles.msgTime}
        data-testid="message-timestamp"
        dateTime={message.createdAt}
      >
        {formatTimestamp(message.createdAt)}
      </time>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round divider
// ---------------------------------------------------------------------------

function RoundDivider({ round }: { round: number }) {
  return (
    <div className={styles.roundDivider} data-testid="round-divider">
      <span className={styles.roundLine} />
      <span className={styles.roundLabel}>第 {round} 轮</span>
      <span className={styles.roundLine} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TranscriptArea() {
  const messages = useTranscriptStore((s) => s.messages);
  const currentRound = useTranscriptStore((s) => s.currentRound);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    // If user scrolled up more than 100px from bottom, disable auto-scroll
    shouldAutoScroll.current =
      scrollHeight - scrollTop - clientHeight < 100;
  };

  // Group messages by round
  const rounds = new Map<number, Message[]>();
  for (const msg of messages) {
    const arr = rounds.get(msg.roundNumber) || [];
    arr.push(msg);
    rounds.set(msg.roundNumber, arr);
  }

  const sortedRounds = [...rounds.keys()].sort((a, b) => a - b);
  const isEmpty = messages.length === 0;

  return (
    <div
      className={styles.area}
      data-testid="transcript-area"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {isEmpty ? (
        <div className={styles.empty}>
          <p className={styles.emptyIcon}>📜</p>
          <p className={styles.emptyText}>
            {currentRound === 0
              ? "等待讨论开始..."
              : "等待专家发言..."}
          </p>
        </div>
      ) : (
        <div className={styles.messages}>
          {sortedRounds.map((round) => (
            <div key={round} className={styles.roundGroup}>
              <RoundDivider round={round} />
              {rounds.get(round)!.map((msg) => (
                <MessageRow key={msg.id} message={msg} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />

      {/* Scroll-to-bottom button */}
      {!shouldAutoScroll.current && messages.length > 0 && (
        <button
          className={styles.scrollBtn}
          data-testid="scroll-to-bottom-btn"
          onClick={() => {
            shouldAutoScroll.current = true;
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          ↓ 最新
        </button>
      )}
    </div>
  );
}
