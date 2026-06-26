import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useDiscussionStore } from "../../stores/discussionStore";
import { useAgentStore } from "../../stores/agentStore";
import styles from "./CreateDiscussionModal.module.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GUEST_COUNT_OPTIONS = [2, 3, 4, 5, 6];
const TEMPLATE_OPTIONS = [
  { value: "", label: "自动选择" },
  { value: "debate", label: "辩论模式" },
  { value: "roundtable", label: "圆桌讨论" },
  { value: "expert-panel", label: "专家小组" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreateDiscussionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateDiscussionModal({
  open,
  onClose,
}: CreateDiscussionModalProps) {
  const navigate = useNavigate();
  const createDiscussion = useDiscussionStore((s) => s.createDiscussion);
  const setLineup = useAgentStore((s) => s.setLineup);

  const [topic, setTopic] = useState("");
  const [guestCount, setGuestCount] = useState(4);
  const [background, setBackground] = useState("");
  const [template, setTemplate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topicInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus topic input on open
  useEffect(() => {
    if (open) {
      // Small delay so the DOM is painted
      const timer = setTimeout(() => topicInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) onClose();
  };

  // Submit
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!topic.trim()) {
      setError("请输入讨论话题");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const detail = await createDiscussion({
        topic: topic.trim(),
        guestCount,
        background: background.trim() || undefined,
        template: template || undefined,
      });

      // Store lineup in agentStore for the confirm page
      if (detail.agents && detail.agents.length > 0) {
        const host = detail.agents.find((a) => a.isHost)!;
        const guests = detail.agents.filter((a) => !a.isHost);
        setLineup({ host, guests });
      }

      onClose();
      navigate(`/lineup?discussionId=${detail.id}`);
    } catch {
      setError("创建失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      ref={modalRef}
      onClick={handleBackdropClick}
      data-testid="create-discussion-modal"
    >
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>发起新讨论</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            data-testid="create-modal-cancel-btn"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Topic */}
          <div className={styles.field}>
            <label htmlFor="modal-topic" className={styles.label}>
              讨论话题 <span className={styles.required}>*</span>
            </label>
            <input
              id="modal-topic"
              ref={topicInputRef}
              type="text"
              className={styles.input}
              placeholder="例如：人工智能是否应该拥有法律人格？"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={200}
              data-testid="create-modal-topic-input"
            />
            <span className={styles.hint}>{topic.length}/200</span>
          </div>

          {/* Guest count */}
          <div className={styles.field}>
            <label className={styles.label}>
              专家人数 <span className={styles.required}>*</span>
            </label>
            <div className={styles.countGroup}>
              {GUEST_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${styles.countBtn} ${
                    guestCount === n ? styles.countBtnActive : ""
                  }`}
                  onClick={() => setGuestCount(n)}
                  data-testid={`create-modal-guest-count-${n}`}
                >
                  {n} 位
                </button>
              ))}
            </div>
          </div>

          {/* Background */}
          <div className={styles.field}>
            <label htmlFor="modal-bg" className={styles.label}>
              背景说明
            </label>
            <textarea
              id="modal-bg"
              className={styles.textarea}
              placeholder="描述讨论背景，帮助AI理解上下文（选填）"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              maxLength={2000}
              rows={3}
              data-testid="create-modal-background-input"
            />
          </div>

          {/* Template */}
          <div className={styles.field}>
            <label className={styles.label}>讨论模板</label>
            <div className={styles.templateGroup}>
              {TEMPLATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.templateBtn} ${
                    template === opt.value ? styles.templateBtnActive : ""
                  }`}
                  onClick={() => setTemplate(opt.value)}
                  data-testid={
                    opt.value
                      ? `create-modal-template-${opt.value}`
                      : undefined
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && <p className={styles.error}>{error}</p>}

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              data-testid="create-modal-cancel-btn"
            >
              取消
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || !topic.trim()}
              data-testid="create-modal-submit-btn"
            >
              {submitting ? (
                <span data-testid="create-modal-loading">生成中...</span>
              ) : (
                "确认创建"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
