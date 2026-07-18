import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  compilePacket,
  parsePacket,
  parseSyncLog,
} from "~/server/orchestra/packets";
import { PacketKindSchema, SyncLogSchema } from "~/server/orchestra/schemas";

export const packetRouter = createTRPCRouter({
  parse: publicProcedure
    .input(z.object({ rawMarkdown: z.string().min(1) }))
    .mutation(({ input }) => {
      return parsePacket(input.rawMarkdown);
    }),

  parseSyncLog: publicProcedure
    .input(z.object({ rawMarkdown: z.string().min(1) }))
    .mutation(({ input }) => {
      return parseSyncLog(input.rawMarkdown);
    }),

  compile: publicProcedure
    .input(
      z.object({
        kind: PacketKindSchema,
        payload: z.unknown(),
      }),
    )
    .mutation(({ input }) => {
      const markdown = compilePacket(input.kind, input.payload);
      return { markdown };
    }),

  compileSyncLog: publicProcedure
    .input(z.object({ payload: SyncLogSchema }))
    .mutation(({ input }) => {
      const markdown = compilePacket("sync_log", input.payload);
      return { markdown };
    }),
});
