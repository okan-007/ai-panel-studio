import { useTranscriptStore } from "../../stores/transcriptStore";
import styles from "./SummaryOverlay.module.css";

// ---------------------------------------------------------------------------
// Simple markdown-to-text (render limited markdown as HTML)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): string {
  // Basic: headers, bold, lists
  return text
    .replace(/### (.+)/g, "<h4>$1</h4>")
    .replace(/## (.+)/g, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    .replace(/\n\n/g, "<br/><br/>");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SummaryOverlayProps {
  onReturnHome: () => void;
  onRestart?: () => void;
}

export default function SummaryOverlay({
  onReturnHome,
  onRestart,
}: SummaryOverlayProps) {
  const summary = useTranscriptStore((s) => s.summary);
  const status = useTranscriptStore((s) => s.status);

  const isVisible = status === "completed" || status === "stopped";

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      // Fallback: silent
    }
  };

  return (
    <div
      className={`${styles.overlay} ${isVisible ? styles.visible : ""}`}
      data-testid="summary-overlay"
      aria-hidden={!isVisible}
    >
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {status === "completed" ? "讨论总结" : "讨论已终止"}
          </h2>
          <span className={styles.badge}>
            {status === "completed" ? "已完成" : "已停止"}
          </span>
        </div>

        {/* Content */}
        <div
          className={styles.content}
          data-testid="summary-content"
          dangerouslySetInnerHTML={{
            __html: summary
              ? renderMarkdown(summary)
              : "<p>暂无总结内容</p>",
          }}
        />

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.copyBtn}
            onClick={handleCopy}
            data-testid="summary-copy-btn"
          >
            复制总结
          </button>
          {onRestart && (
            <button
              className={styles.restartBtn}
              onClick={onRestart}
              data-testid="summary-restart-btn"
            >
              重新讨论
            </button>
          )}
          <button
            className={styles.homeBtn}
            onClick={onReturnHome}
            data-testid="summary-home-btn"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
