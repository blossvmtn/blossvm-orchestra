import { z } from "zod";

export const GitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
export type GitSha = z.infer<typeof GitShaSchema>;
