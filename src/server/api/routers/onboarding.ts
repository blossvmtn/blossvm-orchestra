import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { detectEnvironment, mcpCards } from "~/server/orchestra/detect";
import {
  completeOnboarding,
  loadOnboardingState,
  pinHermesClerk,
} from "~/server/orchestra/onboarding";
import { addRegistryEntry } from "~/server/orchestra/registry";

export const onboardingRouter = createTRPCRouter({
  detect: publicProcedure.query(async () => {
    return detectEnvironment();
  }),

  state: publicProcedure.query(async () => {
    return loadOnboardingState();
  }),

  mcpCards: publicProcedure.query(() => {
    return mcpCards();
  }),

  pinHermes: publicProcedure
    .input(
      z
        .object({
          model: z.string().min(1).optional(),
          baseUrl: z.string().url().optional(),
          skip: z.boolean().optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      return pinHermesClerk(input);
    }),

  anchorRepo: publicProcedure
    .input(
      z.object({
        rootPath: z.string().min(1),
        displayName: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return addRegistryEntry(input);
    }),

  complete: publicProcedure
    .input(
      z
        .object({
          skippedClerk: z.boolean().optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      return completeOnboarding(input);
    }),
});
