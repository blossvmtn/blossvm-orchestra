import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { compilePrBriefForNode } from "~/server/orchestra/brief";
import { hermesChat, hermesLiaise, hermesStatus } from "~/server/orchestra/hermes";
import {
  HermesIntentSchema,
  HermesMessageSchema,
} from "~/server/orchestra/schemas";

export const hermesRouter = createTRPCRouter({
  status: publicProcedure.query(async () => {
    return hermesStatus();
  }),

  chat: publicProcedure
    .input(
      z.object({
        messages: z.array(HermesMessageSchema).min(1),
        model: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return hermesChat(input);
    }),

  liaise: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid().optional(),
        useFixture: z.boolean().optional(),
        intent: HermesIntentSchema,
        instruction: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return hermesLiaise(input);
    }),

  compilePrBrief: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        nodeId: z.string().uuid(),
        title: z.string().optional(),
        summary: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return compilePrBriefForNode(input);
    }),
});
