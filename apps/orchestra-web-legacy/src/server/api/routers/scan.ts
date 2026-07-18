import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { scanTrunk } from "~/server/orchestra/scan";

export const scanRouter = createTRPCRouter({
  trunk: publicProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input }) => {
      return scanTrunk(input.repoId);
    }),
});
