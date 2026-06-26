/**
 * scenario-2-isolation.spec.ts
 *
 * E2E Test — 并行讨论隔离
 *
 * Verifies that two independent discussions run in complete isolation:
 *   - Each has its own transcript
 *   - Each has its own consensus / disagreement items
 *   - Switching between discussions preserves state
 *   - One discussion's status does not affect the other
 *
 * 🔴 RED phase — tests define the isolation contract.
 */

import { test, expect } from "@playwright/test";
import { setupMockApi } from "./fixtures/mockApi.js";
import { setupMockSSE } from "./fixtures/mockSSE.js";
import { createSSEEventSequence, createMockLineup } from "./fixtures/mockData.js";
import { SEL } from "./utils/selectors.js";

// ---------------------------------------------------------------------------
// Two independent discussions
// ---------------------------------------------------------------------------

const TOPIC_A = "AI是否应该拥有法律人格？";
const TOPIC_B = "自动驾驶的道德困境如何解决？";
const DISC_A_ID = "disc-iso-a";
const DISC_B_ID = "disc-iso-b";

const lineupA = createMockLineup(TOPIC_A, 3, 0);
const lineupB = createMockLineup(TOPIC_B, 4, 1);
const sseEventsA = createSSEEventSequence(DISC_A_ID, [lineupA.host, ...lineupA.guests]);
const sseEventsB = createSSEEventSequence(DISC_B_ID, [lineupB.host, ...lineupB.guests]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("场景2：并行讨论隔离", () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page, { discussionListCount: 5 }); // includes both A and B
  });

  // -----------------------------------------------------------------------
  // 2.1 — Two discussions appear independently in the list
  // -----------------------------------------------------------------------
  test("两个独立讨论在列表中同时存在", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId(SEL.HOME_PAGE)).toBeVisible();

    // There should be at least 5 cards
    const cards = page.getByTestId(SEL.DISCUSSION_CARD);
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Titles should be distinct
    const allTitles = await page.getByTestId(SEL.DISCUSSION_CARD_TITLE).allTextContents();
    const uniqueTitles = new Set(allTitles);
    expect(uniqueTitles.size).toBeGreaterThanOrEqual(2);
  });

  // -----------------------------------------------------------------------
  // 2.2 — Transcripts are isolated
  // -----------------------------------------------------------------------
  test("两个讨论的 Transcript 互相独立", async ({ page }) => {
    // Seed discussion A state
    await page.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId,
        title: "AI是否应该拥有法律人格？",
        status: "running",
        maxRounds: 3,
        currentRound: 1,
        agents: [
          { id: "a-host", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "a-g-1", name: "张明远", title: "AI伦理学家", color: "#3B82F6", isHost: false },
          { id: "a-g-2", name: "李思齐", title: "法律专家", color: "#F59E0B", isHost: false },
          { id: "a-g-3", name: "王晓峰", title: "计算机科学家", color: "#EF4444", isHost: false },
        ],
        messages: [
          { id: "a-msg-1", agentId: "a-host", agentName: "AI主持人", agentRole: "引导者", agentColor: "#6B7280", roundNumber: 1, type: "opening", content: "【讨论A】欢迎各位。今天我们讨论AI法律人格问题。", isStreaming: false, createdAt: new Date().toISOString() },
          { id: "a-msg-2", agentId: "a-g-1", agentName: "张明远", agentRole: "AI伦理学家", agentColor: "#3B82F6", roundNumber: 1, type: "speech", content: "【讨论A】我认为AI应当拥有有限法律人格。", isStreaming: false, createdAt: new Date().toISOString() },
        ],
        consensusItems: [
          { id: "a-cons-1", content: "【讨论A共识】需要建立新的法律框架", agreedAgentIds: ["a-g-1", "a-g-2"], disagreedAgentIds: [], roundNumber: 1, status: "agreed" },
        ],
      }));
    }, DISC_A_ID);

    // Seed discussion B state — DIFFERENT content
    await page.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId,
        title: "自动驾驶的道德困境如何解决？",
        status: "running",
        maxRounds: 2,
        currentRound: 1,
        agents: [
          { id: "b-host", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "b-g-1", name: "陈志强", title: "车企CEO", color: "#06B6D4", isHost: false },
          { id: "b-g-2", name: "刘雨桐", title: "政策分析师", color: "#F97316", isHost: false },
          { id: "b-g-3", name: "赵雪梅", title: "伦理学教授", color: "#8B5CF6", isHost: false },
          { id: "b-g-4", name: "李思齐", title: "法律顾问", color: "#F59E0B", isHost: false },
        ],
        messages: [
          { id: "b-msg-1", agentId: "b-host", agentName: "AI主持人", agentRole: "引导者", agentColor: "#6B7280", roundNumber: 1, type: "opening", content: "【讨论B】欢迎。今天我们探讨自动驾驶的伦理困境。", isStreaming: false, createdAt: new Date().toISOString() },
          { id: "b-msg-2", agentId: "b-g-1", agentName: "陈志强", agentRole: "车企CEO", agentColor: "#06B6D4", roundNumber: 1, type: "speech", content: "【讨论B】从产业角度看，我们需要明确的责任划分。", isStreaming: false, createdAt: new Date().toISOString() },
        ],
        consensusItems: [
          { id: "b-cons-1", content: "【讨论B共识】需要明确责任归属", agreedAgentIds: ["b-g-1", "b-g-2"], disagreedAgentIds: [], roundNumber: 1, status: "agreed" },
        ],
      }));
    }, DISC_B_ID);

    // --- Verify Discussion A ---
    await page.goto(`/studio/${DISC_A_ID}`);
    await page.reload();
    await expect(page.getByTestId(SEL.STUDIO_PAGE)).toBeVisible();

    // Transcript messages only contain discussion A content
    const messagesA = page.getByTestId(SEL.TRANSCRIPT_MESSAGE);
    const msgCountA = await messagesA.count();
    expect(msgCountA).toBeGreaterThanOrEqual(2);

    // First message should be from Discussion A host
    await expect(messagesA.first().getByTestId(SEL.MESSAGE_CONTENT)).toContainText("讨论A");

    // Consensus items only from discussion A
    const consensusA = page.getByTestId(SEL.CONSENSUS_ITEM);
    await expect(consensusA.first()).toContainText("讨论A共识");

    // --- Navigate to Discussion B ---
    await page.goto(`/studio/${DISC_B_ID}`);
    await page.reload();
    await expect(page.getByTestId(SEL.STUDIO_PAGE)).toBeVisible();

    // Transcript messages only contain discussion B content
    const messagesB = page.getByTestId(SEL.TRANSCRIPT_MESSAGE);
    await expect(messagesB.first().getByTestId(SEL.MESSAGE_CONTENT)).toContainText("讨论B");

    // Consensus items only from discussion B
    const consensusB = page.getByTestId(SEL.CONSENSUS_ITEM);
    await expect(consensusB.first()).toContainText("讨论B共识");

    // --- Go back to Discussion A — state preserved ---
    await page.goto(`/studio/${DISC_A_ID}`);
    await page.reload();

    // Discussion A content should still be there (not overwritten by B)
    await expect(page.getByTestId(SEL.TRANSCRIPT_MESSAGE).first()
      .getByTestId(SEL.MESSAGE_CONTENT)).toContainText("讨论A");
    await expect(page.getByTestId(SEL.CONSENSUS_ITEM).first()).toContainText("讨论A共识");
  });

  // -----------------------------------------------------------------------
  // 2.3 — SSE streams are isolated
  // -----------------------------------------------------------------------
  test("两个讨论的 SSE 流互不干扰", async ({ page }) => {
    // Open Discussion A with its own SSE
    await page.goto(`/studio/${DISC_A_ID}`);
    await page.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId,
        title: "AI是否应该拥有法律人格？",
        status: "running",
        maxRounds: 3,
        currentRound: 1,
        agents: [
          { id: "a-host", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "a-g-1", name: "张明远", title: "AI伦理学家", color: "#3B82F6", isHost: false },
          { id: "a-g-2", name: "李思齐", title: "法律专家", color: "#F59E0B", isHost: false },
          { id: "a-g-3", name: "王晓峰", title: "计算机科学家", color: "#EF4444", isHost: false },
        ],
      }));
    }, DISC_A_ID);
    await page.reload();

    // Start SSE for discussion A only
    await setupMockSSE(page, DISC_A_ID, sseEventsA, { interEventDelay: 80 });
    await page.evaluate(() => {
      const es = new (window as unknown as Record<string, unknown>).EventSource as unknown as EventSource;
      return true;
    });

    // Wait for A's messages
    await page.waitForSelector(`[data-testid="${SEL.TRANSCRIPT_MESSAGE}"]`, { timeout: 5000 });

    // Collect all message headers from discussion A
    const aMessageTexts = await page.getByTestId(SEL.MESSAGE_CONTENT).allTextContents();
    const hasBContent = aMessageTexts.some((t) => t.includes("讨论B"));
    expect(hasBContent).toBe(false); // No cross-contamination

    // Now navigate to B
    await page.goto(`/studio/${DISC_B_ID}`);
    await page.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId,
        title: "自动驾驶的道德困境如何解决？",
        status: "running",
        maxRounds: 2,
        currentRound: 1,
        agents: [
          { id: "b-host", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "b-g-1", name: "陈志强", title: "车企CEO", color: "#06B6D4", isHost: false },
          { id: "b-g-2", name: "刘雨桐", title: "政策分析师", color: "#F97316", isHost: false },
          { id: "b-g-3", name: "赵雪梅", title: "伦理学教授", color: "#8B5CF6", isHost: false },
        ],
      }));
    }, DISC_B_ID);
    await page.reload();

    // Start B's SSE
    await setupMockSSE(page, DISC_B_ID, sseEventsB, { interEventDelay: 80 });
    await page.evaluate(() => {
      const es = new (window as unknown as Record<string, unknown>).EventSource as unknown as EventSource;
      return true;
    });

    await page.waitForSelector(`[data-testid="${SEL.TRANSCRIPT_MESSAGE}"]`, { timeout: 5000 });

    // Discussion B messages should not contain A content
    const bMessageTexts = await page.getByTestId(SEL.MESSAGE_CONTENT).allTextContents();
    const hasAContent = bMessageTexts.some((t) => t.includes("讨论A"));
    expect(hasAContent).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 2.4 — Stopping one discussion doesn't affect the other
  // -----------------------------------------------------------------------
  test("停止一个讨论不影响另一个", async ({ page }) => {
    // Seed both discussions as running
    for (const { discId, title } of [
      { discId: DISC_A_ID, title: TOPIC_A },
      { discId: DISC_B_ID, title: TOPIC_B },
    ]) {
      await page.evaluate(({ id, t }) => {
        sessionStorage.setItem(`discussion-${id}`, JSON.stringify({
          id, title: t, status: "running", maxRounds: 3, currentRound: 2, agents: [],
        }));
      }, { id: discId, t: title });
    }

    // Open Discussion A
    await page.goto(`/studio/${DISC_A_ID}`);
    await expect(page.getByTestId(SEL.STUDIO_PAGE)).toBeVisible();

    // Stop button is visible
    await expect(page.getByTestId(SEL.STOP_BTN)).toBeVisible();

    // Click stop → confirm
    await page.getByTestId(SEL.STOP_BTN).click();
    const confirmDialog = page.getByTestId(SEL.CONFIRM_DIALOG);
    await expect(confirmDialog).toBeVisible();
    await page.getByTestId(SEL.CONFIRM_DIALOG_CONFIRM).click();

    // Status should change to stopped
    await expect(page.getByTestId(SEL.STUDIO_STATUS_INDICATOR)).toContainText(/已停止|stopped/i);

    // Navigate to home — Discussion B should still be running
    await page.goto("/");
    const cards = page.getByTestId(SEL.DISCUSSION_CARD);

    // Find the card for discussion B
    const bCard = cards.filter({ hasText: TOPIC_B.slice(0, 6) });
    await expect(bCard.getByTestId(SEL.DISCUSSION_CARD_STATUS)).not.toContainText(/已停止|stopped/i);
  });

  // -----------------------------------------------------------------------
  // 2.5 — Concurrent SSE streams in separate tabs
  // -----------------------------------------------------------------------
  test("两个浏览器 Tab 中的讨论完全隔离", async ({ context }) => {
    // Open two pages (tabs) in the same browser context
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    // Setup mock APIs for both
    await setupMockApi(pageA, { discussionListCount: 5 });
    await setupMockApi(pageB, { discussionListCount: 5 });

    // Seed discussion A state
    await pageA.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId, title: TOPIC_A, status: "running", maxRounds: 3, currentRound: 1,
        agents: [
          { id: "a-host", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "a-g-1", name: "张明远", title: "AI伦理学家", color: "#3B82F6", isHost: false },
          { id: "a-g-2", name: "李思齐", title: "法律专家", color: "#F59E0B", isHost: false },
        ],
      }));
    }, DISC_A_ID);
    await pageA.goto(`/studio/${DISC_A_ID}`);
    await pageA.reload();

    // Seed discussion B state
    await pageB.evaluate((discId) => {
      sessionStorage.setItem(`discussion-${discId}`, JSON.stringify({
        id: discId, title: TOPIC_B, status: "running", maxRounds: 2, currentRound: 1,
        agents: [
          { id: "b-host", name: "AI主持人", title: "引导者", color: "#6B7280", isHost: true },
          { id: "b-g-1", name: "陈志强", title: "车企CEO", color: "#06B6D4", isHost: false },
          { id: "b-g-2", name: "刘雨桐", title: "政策分析师", color: "#F97316", isHost: false },
        ],
      }));
    }, DISC_B_ID);
    await pageB.goto(`/studio/${DISC_B_ID}`);
    await pageB.reload();

    // Start SSE on A only
    await setupMockSSE(pageA, DISC_A_ID, sseEventsA, { interEventDelay: 100 });
    await pageA.evaluate(() => {
      const es = new (window as unknown as Record<string, unknown>).EventSource as unknown as EventSource;
      return true;
    });

    // Start SSE on B only (different events)
    await setupMockSSE(pageB, DISC_B_ID, sseEventsB, { interEventDelay: 100 });
    await pageB.evaluate(() => {
      const es = new (window as unknown as Record<string, unknown>).EventSource as unknown as EventSource;
      return true;
    });

    // Wait for messages on both
    await pageA.waitForSelector(`[data-testid="${SEL.TRANSCRIPT_MESSAGE}"]`, { timeout: 5000 });
    await pageB.waitForSelector(`[data-testid="${SEL.TRANSCRIPT_MESSAGE}"]`, { timeout: 5000 });

    // Tab A shows discussion A title
    await expect(pageA.getByTestId(SEL.STUDIO_TITLE)).toContainText("法律人格");

    // Tab B shows discussion B title
    await expect(pageB.getByTestId(SEL.STUDIO_TITLE)).toContainText("自动驾驶");

    // Tab A messages and consensus are from A
    const aMessageTexts = await pageA.getByTestId(SEL.MESSAGE_CONTENT).allTextContents();
    expect(aMessageTexts.some((t) => t.includes("讨论B"))).toBe(false);

    // Tab B messages and consensus are from B
    const bMessageTexts = await pageB.getByTestId(SEL.MESSAGE_CONTENT).allTextContents();
    expect(bMessageTexts.some((t) => t.includes("讨论A"))).toBe(false);

    // Cleanup
    await pageA.close();
    await pageB.close();
  });
});
