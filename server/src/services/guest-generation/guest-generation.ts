/**
 * guest-generation.ts
 *
 * Service responsible for generating an agent lineup (1 host + N guests)
 * from a discussion topic.  Calls the Deepseek API; falls back to a
 * deterministic local generator when the API is unavailable or returns
 * invalid data.
 */

import {
  type Agent,
  type AgentLineup,
  type LineupGenerationInput,
  type DeepseekLineupResponse,
  AgentLineupSchema,
  DeepseekLineupResponseSchema,
  AGENT_COLORS,
} from "../../schemas/agent.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEEPSEEK_BASE = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? "sk-placeholder";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

function buildLineupPrompt(input: LineupGenerationInput): string {
  const templateHint =
    input.template === "debate"
      ? "采用正反方辩论模式，确保观点有明确的对立性。"
      : input.template === "expert-panel"
        ? "采用专家会诊模式，强调专业性和多角度分析。"
        : "采用圆桌讨论模式，追求观点的多样性和互补性。";

  return `你是一个专业讨论主持人配置系统。请根据以下话题，生成圆桌讨论的嘉宾阵容。

话题：${input.topic}
${input.background ? `背景补充：${input.background}` : ""}
嘉宾人数：${input.guestCount} 人
${templateHint}

请返回严格的 JSON 格式（不要包含 markdown 代码块标记）：
{
  "host": {
    "name": "主持人姓名",
    "title": "头衔（如"资深媒体人"）",
    "stance": "中立客观的引导立场描述",
    "color": "${AGENT_COLORS[0]}"
  },
  "guests": [
    {
      "name": "嘉宾姓名",
      "title": "职业/头衔",
      "stance": "对该话题的核心立场（一句话）",
      "color": "从预定义颜色中选一个"
    }
  ]
}

要求：
1. host 必须是中立引导角色，颜色固定为 ${AGENT_COLORS[0]}。
2. guests 数量必须恰好为 ${input.guestCount} 人。
3. 每位 guest 的 stance 必须明确、互不重复。
4. 每位 guest 的 color 必须从以下颜色中选取且不重复：${AGENT_COLORS.slice(1).join(", ")}。
5. 嘉宾姓名使用中文，角色多样化。`;
}

// ---------------------------------------------------------------------------
// Deepseek API call
// ---------------------------------------------------------------------------

async function callDeepseek(prompt: string): Promise<DeepseekLineupResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content: "你是一个专业的讨论阵容配置系统，只返回 JSON，不返回其他内容。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Deepseek API returned ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error("Deepseek API returned empty content");
    }

    // Try to parse JSON — the content might contain markdown fences
    let jsonStr = rawContent.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as unknown;
    return DeepseekLineupResponseSchema.parse(parsed);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = MAX_RETRIES): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 500ms, 1s, 2s...
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error("Retries exhausted");
}

// ---------------------------------------------------------------------------
// Normalise / transform API response into AgentLineup
// ---------------------------------------------------------------------------

function toAgentLineup(raw: DeepseekLineupResponse, guestCount: number): AgentLineup {
  // Trim or pad guests to match requested count
  let guests = raw.guests.slice(0, guestCount);

  // Assign unique colors from the predefined palette
  const assignedColors = new Set<string>();

  // Normalise host color — force into AGENT_COLORS palette if invalid
  let hostColor = raw.host.color;
  if (!AGENT_COLORS.includes(hostColor as typeof AGENT_COLORS[number])) {
    hostColor = AGENT_COLORS[0]; // default host color
  }
  assignedColors.add(hostColor);

  guests = guests.map((g, i) => {
    let color = g.color;
    if (assignedColors.has(color) || !AGENT_COLORS.includes(color as typeof AGENT_COLORS[number])) {
      // Find next available color
      const available = AGENT_COLORS.filter((c) => !assignedColors.has(c));
      color = available[i % available.length] ?? AGENT_COLORS[(i + 1) % AGENT_COLORS.length];
    }
    assignedColors.add(color);

    return {
      id: crypto.randomUUID(),
      name: g.name,
      title: g.title,
      stance: g.stance,
      color,
      isHost: false as const,
      sortOrder: i,
    };
  });

  return AgentLineupSchema.parse({
    host: {
      id: crypto.randomUUID(),
      name: raw.host.name,
      title: raw.host.title,
      stance: raw.host.stance,
      color: hostColor,
      isHost: true as const,
      sortOrder: -1, // host always first
    },
    guests,
  });
}

// ---------------------------------------------------------------------------
// Fallback deterministic generator
// ---------------------------------------------------------------------------

/** Deterministic fallback — generates agents locally without any API call. */
export function generateFallbackLineup(topic: string, guestCount: number): AgentLineup {
  const archetypes = [
    { title: "AI伦理研究员", stance: "从伦理角度审视，主张审慎推进" },
    { title: "科技法律顾问", stance: "从法律框架出发，强调先行立法" },
    { title: "计算机科学家", stance: "关注技术可行性，主张务实方案" },
    { title: "社会学教授", stance: "关注社会结构影响，强调人文关怀" },
    { title: "企业家代表", stance: "从产业应用出发，支持敏捷迭代" },
    { title: "公共政策分析师", stance: "从政策制定角度，提出分阶段路线图" },
  ];

  const surnames = ["张", "李", "王", "赵", "陈", "刘"];
  const givenNames = ["明远", "思齐", "晓峰", "雪梅", "志强", "雨桐"];

  const guests: Agent[] = [];
  const usedColors = new Set<string>();

  for (let i = 0; i < Math.min(guestCount, archetypes.length); i++) {
    const archetype = archetypes[i];
    // Prefer stereotype name but cycle through name list
    const name = `${surnames[i % surnames.length]}${givenNames[i % givenNames.length]}`;
    // Assign next unused AGENT_COLOR starting from index 1 (skip host color)
    let color = AGENT_COLORS[(i + 1) % AGENT_COLORS.length];
    if (usedColors.has(color)) {
      const available = AGENT_COLORS.filter((c) => !usedColors.has(c));
      color = available[0] ?? AGENT_COLORS[i % AGENT_COLORS.length];
    }
    usedColors.add(color);

    guests.push({
      id: crypto.randomUUID(),
      name,
      title: archetype.title,
      stance: `关于"${topic}"，${archetype.stance}`,
      color,
      isHost: false,
      sortOrder: i,
    });
  }

  return AgentLineupSchema.parse({
    host: {
      id: crypto.randomUUID(),
      name: "AI主持人",
      title: "圆桌讨论引导者",
      stance: `围绕"${topic}"，保持中立客观立场，引导各方充分表达观点`,
      color: AGENT_COLORS[0],
      isHost: true,
      sortOrder: -1,
    },
    guests,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a complete agent lineup for a discussion.
 *
 * 1. Calls Deepseek API with retry logic.
 * 2. Validates the response against the expected schema.
 * 3. Falls back to a deterministic local generator on any failure.
 */
export async function generateLineup(input: LineupGenerationInput): Promise<AgentLineup> {
  try {
    const prompt = buildLineupPrompt(input);
    const raw = await withRetry(() => callDeepseek(prompt));
    return toAgentLineup(raw, input.guestCount);
  } catch (err) {
    // Log the error in production; for MVP we silently fall back
    console.warn("[guest-generation] API call failed, using fallback:", String(err));
    return generateFallbackLineup(input.topic, input.guestCount);
  }
}
