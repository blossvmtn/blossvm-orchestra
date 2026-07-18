import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { RemoveModeSchema } from "~/server/orchestra/schemas";
import {
  createWorktree,
  listWorktreeNodes,
  removeWorktree,
} from "~/server/orchestra/worktrees";

export const worktreeRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        slug: z.string().min(1),
        branch: z.string().min(1),
        allowedPaths: z.array(z.string()),
        forbiddenPaths: z.array(z.string()),
        modelHint: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return createWorktree(input);
    }),

  list: publicProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input }) => {
      return listWorktreeNodes(input.repoId);
    }),

  remove: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        nodeId: z.string().uuid(),
        mode: RemoveModeSchema,
      }),
    )
    .mutation(async ({ input }) => {
      return removeWorktree(input);
    }),
});
