import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { addRegistryEntry, listRegistry } from "~/server/orchestra/registry";

export const registryRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return listRegistry();
  }),

  add: publicProcedure
    .input(
      z.object({
        rootPath: z.string().min(1),
        displayName: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return addRegistryEntry(input);
    }),
});
