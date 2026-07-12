import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { StackedActionInputSchema } from "~/server/orchestra/schemas";
import { runStackedAction } from "~/server/orchestra/stacked";

export const gitRouter = createTRPCRouter({
  stackedAction: publicProcedure
    .input(StackedActionInputSchema)
    .mutation(async ({ input }) => {
      return runStackedAction(input);
    }),
});
