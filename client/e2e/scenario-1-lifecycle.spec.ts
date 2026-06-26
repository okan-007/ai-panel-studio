/**
 * scenario-1-lifecycle.spec.ts
 *
 * E2E Test — 完整讨论生命周期
 *
 * Covers the full user journey:
 *   HomePage → Create Modal → Lineup Page → Studio Page (SSE-driven) → Summary
 *
 * 🔴 RED phase — these tests define the contract. They will fail until
 * the corresponding UI components are implemented.
 */

import { test, expect } from "@playwright/test";
import { setupMockApi } from "./fixtures/mockApi.js";
import { setupMockSSE } from "./fixtures/mockSSE.js";
import { createSSEEventSequence, createMockLineup, createMockDiscussion } from "./fixtures/mockData.js";
import { SEL } from "./utils/selectors.js";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TOPIC = "人工智能是否会取代人类工作？";
const GUEST_COUNT = 4;
const DISCUSSION_ID = "disc-e2e-001";
const lineup = createMockLineup(TOPIC, GUEST_COUNT);
const sseEvents = createSSEEventSequence(DISCUSSION_ID, [lineup.host, ...lineup.guests]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("场景1：完整讨论生命周期", () => {
  test.beforeEach(async ({ page }) => {
    // Set up mock API with 3 existing discussions
    await setupMockApi(page, {
      discussionListCount: 3,
      simulateError: "none",
    });
  });

  // -----------------------------------------------------------------------
  // Step 1: Home page — see discussion list
  // -----------------------------------------------------------------------
  test("步骤1 — 首页展示讨论列表", async ({ page }) => {
    await page.goto("/");

    // Page renders
    await expect(page.getByTestId(SEL.HOME_PAGE)).toBeVisible();

    // Should see 3 discussion cards
    const cards = page.getByTestId(SEL.DISCUSSION_CARD);
    await expect(cards).toHaveCount(3);

    // "发起新讨论" button is visible
    await expect(page.getByTestId(SEL.CREATE_DISCUSSION_BTN)).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Step 2: Open create modal
  // -----------------------------------------------------------------------
  test("步骤2 — 打开创建讨论 Modal", async ({ page }) => {
    await page.goto("/");

    // Click the CTA button
    await page.getByTestId(SEL.CREATE_DISCUSSION_BTN).click();

    // Modal should be visible
    const modal = page.getByTestId(SEL.CREATE_MODAL);
    await expect(modal).toBeVisible();

    // Topic input should be focused
    const topicInput = page.getByTestId(SEL.CREATE_MODAL_TOPIC_INPUT);
    await expect(topicInput).toBeFocused();
  });

  // -----------------------------------------------------------------------
  // Step 3: Fill form and submit
  // -----------------------------------------------------------------------
  test("步骤3 — 填写话题、选择专家人数、提交", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId(SEL.CREATE_DISCUSSION_BTN).click();

    // Fill in the topic
    await page.getByTestId(SEL.CREATE_MODAL_TOPIC_INPUT).fill(TOPIC);

    // Select 4 experts
    await page.getByTestId(SEL.CREATE_MODAL_GUEST_COUNT_4).click();

    // (Optional) Fill background
    await page.getByTestId(SEL.CREATE_MODAL_BACKGROUND_INPUT)
      .fill("探讨AI对就业市场的影响以及人类如何适应");

    // Submit
    await page.getByTestId(SEL.CREATE_MODAL_SUBMIT_BTN).click();

    // Should navigate to lineup page
    await page.waitForURL("**/lineup**", { timeout: 5000 });
    await expect(page.getByTestId(SEL.LINEUP_PAGE)).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Step 4: Lineup page — verify agent cards
  // -----------------------------------------------------------------------
  test("步骤4 — 阵容确认页展示 1 主持人 + 4 专家", async ({ page }) => {
    // Navigate directly — simulate having already created the discussion
    await page.goto("/lineup");
    // Pre-seed localStorage or query params — we rely on mock API returning lineup
    await page.evaluate(() => {
      sessionStorage.setItem("pendingLineup", JSON.stringify({
        topic: "人工智能是否会取代人类工作？",
        guestCount: 4,
        host: { id: "agent-host-0", name: "AI主持人", title: "圆桌讨论引导者", stance: "中立客观", color: "#6B7280", isHost: true },
        guests: [
          { id: "g-1", name: "张明远", title: "AI伦理研究所所长", stance: "支持渐进式赋权", color: "#3B82F6", isHost: false },
          { id: "g-2", name: "李思齐", title: "科技法律事务所合伙人", stance: "审慎监管", color: "#F59E0B", isHost: false },
          { id: "g-3", name: "王晓峰", title: "计算机科学AI研究员", stance: "反对人格化", color: "#EF4444", isHost: false },
          { id: "g-4", name: "赵雪梅", title: "社会学教授", stance: "关注社会影响", color: "#8B5CF6", isHost: false },
        ],
      }));
    });
    await page.reload();

    // Lineup page renders
    await expect(page.getByTestId(SEL.LINEUP_PAGE)).toBeVisible();

    // Topic banner shows the topic
    await expect(page.getByTestId(SEL.TOPIC_BANNER_TEXT)).toContainText("人工智能");

    // Host card is present
    const hostCard = page.getByTestId(SEL.HOST_CARD);
    await expect(hostCard).toBeVisible();
    await expect(hostCard.getByTestId(SEL.AGENT_CARD_NAME)).toContainText("主持人");

    // 4 guest cards
    const guestCards = page.getByTestId(SEL.AGENT_CARD);
    await expect(guestCards).toHaveCount(4);

    // Each guest card has name, title, stance, color
    const firstGuest = guestCards.first();
    await expect(firstGuest.getByTestId(SEL.AGENT_CARD_NAME)).not.toBeEmpty();
    await expect(firstGuest.getByTestId(SEL.AGENT_CARD_TITLE)).not.toBeEmpty();
    await expect(firstGuest.getByTestId(SEL.AGENT_CARD_STANCE)).not.toBeEmpty();
    await expect(firstGuest.getByTestId(SEL.AGENT_CARD_COLOR)).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Step 5: Confirm lineup → enter studio
  // -----------------------------------------------------------------------
  test("步骤5 — 确认进入演播厅", async ({ page }) => {
    // Set up the state and navigate
    await page.goto("/lineup");
    await page.evaluate(() => {
      sessionStorage.setItem("pendingLineup", JSON.stringify({
        topic: "人工智能是否会取代人类工作？",
        guestCount: 4,
        discussionId: "disc-e2e-001",
        host: { id: "agent-host-0", name: "AI主持人", title: "引导者", stance: "中立", color: "#6B7280", isHost: true },
        guests: [
          { id: "g-1", name: "张明远", title: "AI伦理研究所所长", stance: "支持", color: "#3B82F6", isHost: false },
          { id: "g-2", name: "李思齐", title: "科技法律事务所合伙人", stance: "审慎", color: "#F59E0B", isHost: false },
          { id: "g-3", name: "王晓峰", title: "计算机科学AI研究员", stance: "反对", color: "#EF4444", isHost: false },
          { id: "g-4", name: "赵雪梅", title: "社会学教授", stance: "关注社会", color: "#8B5CF6", isHost: false },
        ],
      }));
    });
    await page.reload();

    await expect(page.getByTestId(SEL.LINEUP_PAGE)).toBeVisible();

    // Click confirm
    await page.getByTestId(SEL.CONFIRM_LINEUP_BTN).click();

    // Should navigate to studio
    await page.waitForURL("**/studio/**", { timeout: 5000 });
    await expect(page.getByTestId(SEL.STUDIO_PAGE)).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Step 6: Studio — agent status panel
  // -----------------------------------------------------------------------
  test("步骤6 — 演播厅专家状态面板显示全部为'待机'", async ({ page }) => {
    // Navigate to the studio page with pre-set state
    await page.goto(`/studio/${DISCUSSION_ID}`);
    await page.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId,
        title: "人工智能是否会取代人类工作？",
        status: "ready",
        maxRounds: 3,
        currentRound: 0,
        agents: [
          { id: "agent-host-0", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "g-1", name: "张明远", title: "AI伦理学家", color: "#3B82F6", isHost: false },
          { id: "g-2", name: "李思齐", title: "法律专家", color: "#F59E0B", isHost: false },
          { id: "g-3", name: "王晓峰", title: "计算机科学家", color: "#EF4444", isHost: false },
          { id: "g-4", name: "赵雪梅", title: "社会学家", color: "#8B5CF6", isHost: false },
        ],
      }));
    }, DISCUSSION_ID);
    await page.reload();

    await expect(page.getByTestId(SEL.STUDIO_PAGE)).toBeVisible();

    // Agent status panel is visible
    const statusPanel = page.getByTestId(SEL.AGENT_STATUS_PANEL);
    await expect(statusPanel).toBeVisible();

    // Each agent has a status card
    const statusCards = page.getByTestId(SEL.AGENT_STATUS_CARD);
    await expect(statusCards).toHaveCount(5); // 1 host + 4 guests

    // All agents show "待机" status
    const statusLabels = page.getByTestId(SEL.AGENT_STATUS_LABEL);
    const count = await statusLabels.count();
    for (let i = 0; i < count; i++) {
      await expect(statusLabels.nth(i)).toContainText(/待机|准备/);
    }
  });

  // -----------------------------------------------------------------------
  // Step 7: SSE-driven transcript updates
  // -----------------------------------------------------------------------
  test("步骤7 — SSE 推送消息，Transcript 和共识/分歧同步更新", async ({ page }) => {
    // Set up studio state
    await page.goto(`/studio/${DISCUSSION_ID}`);
    await page.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId,
        title: "人工智能是否会取代人类工作？",
        status: "ready",
        maxRounds: 3,
        currentRound: 0,
        agents: [
          { id: "agent-host-0", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "g-1", name: "张明远", title: "AI伦理学家", color: "#3B82F6", isHost: false },
          { id: "g-2", name: "李思齐", title: "法律专家", color: "#F59E0B", isHost: false },
          { id: "g-3", name: "王晓峰", title: "计算机科学家", color: "#EF4444", isHost: false },
          { id: "g-4", name: "赵雪梅", title: "社会学家", color: "#8B5CF6", isHost: false },
        ],
      }));
    }, DISCUSSION_ID);
    await page.reload();

    // Set up mock SSE
    await setupMockSSE(page, DISCUSSION_ID, sseEvents, { interEventDelay: 100 });

    // Trigger discussion start (simulate SSE connection being opened)
    await page.evaluate(() => {
      // Create EventSource — will use our mock
      const es = new (window as unknown as Record<string, unknown>).EventSource as unknown as EventSource;
      return true;
    });

    // Wait for initial messages to appear
    await page.waitForSelector(`[data-testid="${SEL.TRANSCRIPT_MESSAGE}"]`, { timeout: 5000 });

    // Verify multiple transcript messages appear
    const messages = page.getByTestId(SEL.TRANSCRIPT_MESSAGE);
    const msgCount = await messages.count();
    expect(msgCount).toBeGreaterThanOrEqual(1);

    // Verify the first message is from the host (opening)
    const firstMsg = messages.first();
    await expect(firstMsg.getByTestId(SEL.MESSAGE_HEADER)).toContainText("主持人");

    // Wait for consensus items to appear
    await page.waitForSelector(`[data-testid="${SEL.CONSENSUS_ITEM}"]`, { timeout: 10000 });

    // Verify consensus panel has items
    const consensusItems = page.getByTestId(SEL.CONSENSUS_ITEM);
    await expect(consensusItems.first()).toBeVisible();

    // Wait for more messages (all SSE events to dispatch)
    await page.waitForTimeout(5000);

    // Transcript should have multiple messages by now
    const finalMsgCount = await page.getByTestId(SEL.TRANSCRIPT_MESSAGE).count();
    expect(finalMsgCount).toBeGreaterThanOrEqual(3);
  });

  // -----------------------------------------------------------------------
  // Step 8: Summary overlay on completion
  // -----------------------------------------------------------------------
  test("步骤8 — 讨论结束后主持人总结覆盖 Transcript", async ({ page }) => {
    await page.goto(`/studio/${DISCUSSION_ID}`);
    await page.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId,
        title: "人工智能是否会取代人类工作？",
        status: "running",
        maxRounds: 3,
        currentRound: 3,
        agents: [
          { id: "agent-host-0", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "g-1", name: "张明远", title: "AI伦理学家", color: "#3B82F6", isHost: false },
          { id: "g-2", name: "李思齐", title: "法律专家", color: "#F59E0B", isHost: false },
          { id: "g-3", name: "王晓峰", title: "计算机科学家", color: "#EF4444", isHost: false },
        ],
      }));
    }, DISCUSSION_ID);
    await page.reload();

    // Simulate the final SSE events (just the last few: closing + summary + status_change)
    const finalEvents = sseEvents.slice(-5);
    await setupMockSSE(page, DISCUSSION_ID, finalEvents, { interEventDelay: 150 });

    await page.evaluate(() => {
      const es = new (window as unknown as Record<string, unknown>).EventSource as unknown as EventSource;
      return true;
    });

    // Wait for summary overlay to appear
    await page.waitForSelector(`[data-testid="${SEL.SUMMARY_OVERLAY}"]`, { timeout: 10000 });

    // Summary overlay should be visible
    const summaryOverlay = page.getByTestId(SEL.SUMMARY_OVERLAY);
    await expect(summaryOverlay).toBeVisible();

    // Summary content should contain topic keywords
    const summaryContent = page.getByTestId(SEL.SUMMARY_CONTENT);
    await expect(summaryContent).toContainText("人工智能");

    // Action buttons should be present
    await expect(page.getByTestId(SEL.SUMMARY_COPY_BTN)).toBeVisible();
    await expect(page.getByTestId(SEL.SUMMARY_HOME_BTN)).toBeVisible();

    // Status indicator shows completed
    const statusIndicator = page.getByTestId(SEL.STUDIO_STATUS_INDICATOR);
    await expect(statusIndicator).toContainText(/已完成|已结束|completed/i);
  });

  // -----------------------------------------------------------------------
  // Step 9: End-to-end — full pipeline integration verification
  // -----------------------------------------------------------------------
  test("步骤9 — 完整链路一致性验证", async ({ page }) => {
    // Setup
    await setupMockApi(page, { discussionListCount: 1 });

    // 1. Home → click create
    await page.goto("/");
    await page.getByTestId(SEL.CREATE_DISCUSSION_BTN).click();

    // 2. Fill modal
    await page.getByTestId(SEL.CREATE_MODAL_TOPIC_INPUT).fill(TOPIC);
    await page.getByTestId(SEL.CREATE_MODAL_GUEST_COUNT_4).click();
    await page.getByTestId(SEL.CREATE_MODAL_SUBMIT_BTN).click();

    // 3. Verify lineup
    await page.waitForURL("**/lineup**", { timeout: 5000 });
    await expect(page.getByTestId(SEL.LINEUP_PAGE)).toBeVisible();
    await expect(page.getByTestId(SEL.AGENT_CARD)).toHaveCount(4);

    // 4. Confirm → studio
    await page.getByTestId(SEL.CONFIRM_LINEUP_BTN).click();
    await page.waitForURL("**/studio/**", { timeout: 5000 });
    await expect(page.getByTestId(SEL.STUDIO_PAGE)).toBeVisible();

    // 5. Setup SSE after navigation
    await setupMockSSE(page, DISCUSSION_ID, sseEvents, { interEventDelay: 80 });

    // Trigger SSE connection
    await page.evaluate(() => {
      const es = new (window as unknown as Record<string, unknown>).EventSource as unknown as EventSource;
      return true;
    });

    // 6. Wait for transcript messages
    await page.waitForSelector(`[data-testid="${SEL.TRANSCRIPT_MESSAGE}"]`, { timeout: 5000 });

    // 7. Wait for consensus items
    await page.waitForSelector(`[data-testid="${SEL.CONSENSUS_ITEM}"]`, { timeout: 15000 });

    // 8. Verify consensus not empty
    const consensusItems = page.getByTestId(SEL.CONSENSUS_ITEM);
    const consensusCount = await consensusItems.count();
    expect(consensusCount).toBeGreaterThanOrEqual(1);

    // 9. Wait for completion and summary overlay
    await page.waitForSelector(`[data-testid="${SEL.SUMMARY_OVERLAY}"]`, { timeout: 20000 });
    await expect(page.getByTestId(SEL.SUMMARY_OVERLAY)).toBeVisible();

    // 10. Status should be completed
    await expect(page.getByTestId(SEL.STUDIO_STATUS_INDICATOR)).toContainText(/已完成|已结束|completed/i);

    // 11. Transcript should have multiple messages
    const messageCount = await page.getByTestId(SEL.TRANSCRIPT_MESSAGE).count();
    expect(messageCount).toBeGreaterThanOrEqual(2);
  });
});
