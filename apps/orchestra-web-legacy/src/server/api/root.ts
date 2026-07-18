import { gitRouter } from "~/server/api/routers/git";
import { hermesRouter } from "~/server/api/routers/hermes";
import { manifestRouter } from "~/server/api/routers/manifest";
import { onboardingRouter } from "~/server/api/routers/onboarding";
import { packetRouter } from "~/server/api/routers/packet";
import { registryRouter } from "~/server/api/routers/registry";
import { scanRouter } from "~/server/api/routers/scan";
import { worktreeRouter } from "~/server/api/routers/worktree";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * Primary app router — P0–P5 complete map.
 */
export const appRouter = createTRPCRouter({
  registry: registryRouter,
  worktree: worktreeRouter,
  git: gitRouter,
  scan: scanRouter,
  packet: packetRouter,
  hermes: hermesRouter,
  manifest: manifestRouter,
  onboarding: onboardingRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
