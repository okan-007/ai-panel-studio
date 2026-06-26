import { z } from "zod";

export const ConsensusStatusEnum = z.enum(["proposed", "agreed", "contested"]);

export type ConsensusStatus = z.infer<typeof ConsensusStatusEnum>;

export const ConsensusItemSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1, "Consensus content is required"),
  agreedAgentIds: z.array(z.string().min(1)),
  disagreedAgentIds: z.array(z.string().min(1)),
  roundNumber: z.number().int().min(1),
  status: ConsensusStatusEnum,
});

export type ConsensusItem = z.infer<typeof ConsensusItemSchema>;

/** The expected JSON response from Deepseek for consensus extraction */
export const DeepseekConsensusResponseSchema = z.object({
  consensus: z.array(
    z.object({
      content: z.string(),
      agreedAgentIds: z.array(z.string().min(1)),
      disagreedAgentIds: z.array(z.string().min(1)),
      status: ConsensusStatusEnum,
    })
  ),
});

export type DeepseekConsensusResponse = z.infer<typeof DeepseekConsensusResponseSchema>;

/** Input for the consensus extraction service */
export const ConsensusExtractionInputSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().uuid(),
      agentId: z.string().uuid(),
      agentName: z.string(),
      content: z.string(),
      roundNumber: z.number().int().min(1),
    })
  ),
  existingConsensus: z.array(ConsensusItemSchema).default([]),
  currentRound: z.number().int().min(1),
});

export type ConsensusExtractionInput = z.infer<typeof ConsensusExtractionInputSchema>;
