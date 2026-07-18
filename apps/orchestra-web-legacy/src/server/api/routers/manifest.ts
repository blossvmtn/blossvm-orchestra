import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  dispatchManifest,
  parseManifestMarkdown,
} from "~/server/orchestra/manifest";
import { OrchestraManifestSchema } from "~/server/orchestra/schemas";

export const manifestRouter = createTRPCRouter({
  parse: publicProcedure
    .input(z.object({ rawMarkdown: z.string().min(1) }))
    .mutation(({ input }) => {
      return parseManifestMarkdown(input.rawMarkdown);
    }),

  dispatch: publicProcedure
    .input(z.object({ manifest: OrchestraManifestSchema }))
    .mutation(async ({ input }) => {
      return dispatchManifest(input.manifest);
    }),
});
