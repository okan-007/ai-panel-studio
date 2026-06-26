import { useEffect, useState, useCallback } from "react";
import { useDiscussionStore } from "../stores/discussionStore";
import DiscussionCard from "../components/discussion/DiscussionCard";
import CreateDiscussionModal from "../components/discussion/CreateDiscussionModal";
import type { DiscussionStatus } from "../types";
import styles from "./HomePage.module.css";

// ---------------------------------------------------------------------------
// Status filter tabs
// ---------------------------------------------------------------------------

const STATUS_TABS: { value: DiscussionStatus | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "running", label: "进行中" },
  { value: "completed", label: "已完成" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HomePage() {
  const {
    discussions,
    loading,
    error,
    statusFilter,
    searchQuery,
    fetchDiscussions,
    setStatusFilter,
    setSearchQuery,
    clearError,
  } = useDiscussionStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  // Initial fetch
  useEffect(() => {
    fetchDiscussions();
  }, [fetchDiscussions]);

  // Refetch on filter change
  useEffect(() => {
    fetchDiscussions();
  }, [statusFilter, debouncedSearch, fetchDiscussions]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery]
  );

  return (
    <div className={styles.page} data-testid="home-page">
      {/* Hero area */}
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>AI Panel Studio</h1>
        <p className={styles.heroSub}>
          AI 驱动的圆桌讨论演播厅 — 多角色专家实时辩论，共识自动提取
        </p>
        <button
          className={styles.ctaBtn}
          onClick={() => setModalOpen(true)}
          data-testid="create-discussion-btn"
        >
          + 发起新讨论
        </button>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        {/* Status filter */}
        <div className={styles.filters}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              className={`${styles.filterBtn} ${
                statusFilter === tab.value ? styles.filterBtnActive : ""
              }`}
              onClick={() => setStatusFilter(tab.value)}
              data-testid={`status-filter-${tab.value}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜索讨论..."
            value={searchQuery}
            onChange={handleSearchChange}
            data-testid="search-input"
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner} data-testid="error-banner">
          <span>{error}</span>
          <button onClick={clearError}>✕</button>
        </div>
      )}

      {/* Discussion list */}
      <div className={styles.listArea}>
        {loading && discussions.length === 0 ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p>加载中...</p>
          </div>
        ) : discussions.length === 0 ? (
          <div className={styles.empty} data-testid="empty-state">
            <p className={styles.emptyIcon}>📭</p>
            <p className={styles.emptyTitle}>暂无讨论</p>
            <p className={styles.emptyHint}>
              点击「发起新讨论」创建第一场 AI 圆桌对话
            </p>
          </div>
        ) : (
          <div className={styles.grid} data-testid="discussion-list">
            {discussions.map((d) => (
              <DiscussionCard key={d.id} discussion={d} />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <CreateDiscussionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
