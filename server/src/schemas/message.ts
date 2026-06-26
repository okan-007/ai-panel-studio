import { z } from "zod";

export const MessageTypeEnum = z.enum([
  "opening",
  "speech",
  "closing",
  "system",
  "thinking",
]);

export type MessageType = z.infer<typeof MessageTypeEnum>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid().nullable(),
  agentName: z.string(),
  agentRole: z.string(),
  agentColor: z.string(),
  roundNumber: z.number().int().min(1),
  type: MessageTypeEnum,
  content: z.string(),
  isStreaming: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export type Message = z.infer<typeof MessageSchema>;

/** Transcript passed into scheduling / consensus extraction */
export const TranscriptSchema = z.object({
  discussionId: z.string().uuid(),
  messages: z.array(MessageSchema),
  currentRound: z.number().int().min(1),
  maxRounds: z.number().int().min(1).max(5),
});

export type Transcript = z.infer<typeof TranscriptSchema>;
