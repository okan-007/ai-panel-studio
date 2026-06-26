/**
 * Centralised data-testid constants for E2E selectors.
 *
 * Every interactive element referenced by tests MUST have a corresponding
 * data-testid in the component implementation.  This file is the single
 * source of truth — tests import from here; components use the same keys.
 */

export const SEL = {
  // ---- 首页 (HomePage) ----
  HOME_PAGE: "home-page",
  CREATE_DISCUSSION_BTN: "create-discussion-btn",
  DISCUSSION_CARD: "discussion-card",
  DISCUSSION_CARD_TITLE: "discussion-card-title",
  DISCUSSION_CARD_STATUS: "discussion-card-status",
  DISCUSSION_CARD_AGENT_COUNT: "discussion-card-agent-count",
  DISCUSSION_CARD_PROGRESS: "discussion-card-progress",
  EMPTY_STATE: "empty-state",
  STATUS_FILTER_ALL: "status-filter-all",
  STATUS_FILTER_RUNNING: "status-filter-running",
  STATUS_FILTER_COMPLETED: "status-filter-completed",
  SEARCH_INPUT: "search-input",

  // ---- 创建讨论 Modal ----
  CREATE_MODAL: "create-discussion-modal",
  CREATE_MODAL_TOPIC_INPUT: "create-modal-topic-input",
  CREATE_MODAL_GUEST_COUNT_4: "create-modal-guest-count-4",
  CREATE_MODAL_GUEST_COUNT_3: "create-modal-guest-count-3",
  CREATE_MODAL_GUEST_COUNT_2: "create-modal-guest-count-2",
  CREATE_MODAL_BACKGROUND_INPUT: "create-modal-background-input",
  CREATE_MODAL_TEMPLATE_DEBATE: "create-modal-template-debate",
  CREATE_MODAL_TEMPLATE_ROUNDTABLE: "create-modal-template-roundtable",
  CREATE_MODAL_SUBMIT_BTN: "create-modal-submit-btn",
  CREATE_MODAL_CANCEL_BTN: "create-modal-cancel-btn",
  CREATE_MODAL_LOADING: "create-modal-loading",

  // ---- 阵容确认页 (ConfirmLineupPage) ----
  LINEUP_PAGE: "lineup-page",
  TOPIC_BANNER: "topic-banner",
  TOPIC_BANNER_TEXT: "topic-banner-text",
  HOST_CARD: "host-card",
  AGENT_CARD: "agent-card",
  AGENT_CARD_NAME: "agent-card-name",
  AGENT_CARD_TITLE: "agent-card-title",
  AGENT_CARD_STANCE: "agent-card-stance",
  AGENT_CARD_COLOR: "agent-card-color",
  REGENERATE_BTN: "regenerate-btn",
  CONFIRM_LINEUP_BTN: "confirm-lineup-btn",
  LINEUP_LOADING: "lineup-loading",

  // ---- 演播厅 (StudioPage) ----
  STUDIO_PAGE: "studio-page",
  STUDIO_TOPBAR: "studio-topbar",
  STUDIO_TITLE: "studio-title",
  STUDIO_STATUS_INDICATOR: "studio-status-indicator",
  PAUSE_BTN: "pause-btn",
  RESUME_BTN: "resume-btn",
  STOP_BTN: "stop-btn",
  BACK_BTN: "back-btn",
  ROUND_PROGRESS: "round-progress",
  SPEECH_PROGRESS: "speech-progress",

  // 左栏 - 专家状态面板
  AGENT_STATUS_PANEL: "agent-status-panel",
  AGENT_STATUS_CARD: "agent-status-card",
  AGENT_STATUS_LABEL: "agent-status-label",

  // 主区域 - Transcript
  TRANSCRIPT_AREA: "transcript-area",
  TRANSCRIPT_MESSAGE: "transcript-message",
  MESSAGE_HEADER: "message-header",
  MESSAGE_CONTENT: "message-content",
  MESSAGE_TIMESTAMP: "message-timestamp",
  ROUND_DIVIDER: "round-divider",
  SCROLL_TO_BOTTOM_BTN: "scroll-to-bottom-btn",

  // 共识/分歧
  CONSENSUS_PANEL: "consensus-panel",
  CONSENSUS_ITEM: "consensus-item",
  DISAGREEMENT_PANEL: "disagreement-panel",
  DISAGREEMENT_ITEM: "disagreement-item",

  // 总结覆盖层
  SUMMARY_OVERLAY: "summary-overlay",
  SUMMARY_CONTENT: "summary-content",
  SUMMARY_COLLAPSE_BTN: "summary-collapse-btn",
  SUMMARY_COPY_BTN: "summary-copy-btn",
  SUMMARY_RESTART_BTN: "summary-restart-btn",
  SUMMARY_HOME_BTN: "summary-home-btn",

  // 全局
  TOAST: "toast-notification",
  ERROR_BANNER: "error-banner",
  CONFIRM_DIALOG: "confirm-dialog",
  CONFIRM_DIALOG_CONFIRM: "confirm-dialog-confirm",
  CONFIRM_DIALOG_CANCEL: "confirm-dialog-cancel",

  // 首页 - 讨论列表
  DISCUSSION_LIST: "discussion-list",
} as const;
