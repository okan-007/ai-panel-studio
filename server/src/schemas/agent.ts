import { z } from "zod";

/** Valid hex color (3 or 6 hex digits, with leading #) */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/, "Must be a valid hex color like #3B82F6");

/** Predefined agent colors, cycled through when generating lineup */
export const AGENT_COLORS = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
] as const;

/** An individual agent's definition */
export const AgentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Agent name is required").max(50),
  title: z.string().min(1, "Agent title/role is required").max(80),
  stance: z.string().min(1, "Agent stance is required").max(200),
  color: hexColor,
  isHost: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export type Agent = z.infer<typeof AgentSchema>;

/** The complete lineup returned by the generation service */
export const AgentLineupSchema = z.object({
  host: AgentSchema.extend({ isHost: z.literal(true) }),
  guests: z
    .array(AgentSchema.extend({ isHost: z.literal(false) }))
    .min(2, "At least 2 guest agents are required")
    .max(6, "At most 6 guest agents are allowed"),
});

export type AgentLineup = z.infer<typeof AgentLineupSchema>;

/** The raw payload sent to the AI for lineup generation */
export const LineupGenerationInputSchema = z.object({
  topic: z.string().min(1, "Topic is required").max(200),
  guestCount: z.number().int().min(2).max(6),
  background: z.string().max(2000).default(""),
  template: z.enum(["debate", "roundtable", "expert-panel"]).optional(),
});

export type LineupGenerationInput = z.infer<typeof LineupGenerationInputSchema>;

/** The expected JSON structure returned by Deepseek for lineup generation */
export const DeepseekLineupResponseSchema = z.object({
  host: z.object({
    name: z.string(),
    title: z.string(),
    stance: z.string(),
    color: hexColor,
  }),
  guests: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      stance: z.string(),
      color: hexColor,
    })
  ),
});

export type DeepseekLineupResponse = z.infer<typeof DeepseekLineupResponseSchema>;
