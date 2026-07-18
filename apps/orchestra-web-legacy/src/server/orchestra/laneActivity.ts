import { gitStdout } from "~/server/orchestra/git";
import type { NodeStatus, WorktreeNode } from "~/server/orchestra/schemas";
import { isMeaningfulDirty } from "~/server/orchestra/workingTree";

export type LaneLiveFacts = {
  headSha: string;
  shortSha: string;
  commitsAhead: number;
  dirty: boolean;
  lastCommitMessage: string | null;
  hasUpstream: boolean;
  unpushedCommits: number;
  plainStatus: string;
  nextStep: string;
};

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

async function commitsAheadOf(
  cwd: string,
  baseBranch: string,
): Promise<number> {
  const candidates = [`origin/${baseBranch}`, baseBranch];
  for (const base of candidates) {
    try {
      const out = await gitStdout(cwd, [
        "rev-list",
        "--count",
        `${base}..HEAD`,
      ]);
      const n = Number.parseInt(out, 10);
      if (Number.isFinite(n)) return n;
    } catch {
      // try next base
    }
  }
  return 0;
}

async function upstreamFacts(cwd: string): Promise<{
  hasUpstream: boolean;
  unpushedCommits: number;
}> {
  try {
    await gitStdout(cwd, ["rev-parse", "--abbrev-ref", "@{u}"]);
  } catch {
    return { hasUpstream: false, unpushedCommits: 0 };
  }
  try {
    const out = await gitStdout(cwd, ["rev-list", "--count", "@{u}..HEAD"]);
    const n = Number.parseInt(out, 10);
    return {
      hasUpstream: true,
      unpushedCommits: Number.isFinite(n) ? n : 0,
    };
  } catch {
    return { hasUpstream: true, unpushedCommits: 0 };
  }
}

function plainCopy(input: {
  status: NodeStatus;
  commitsAhead: number;
  dirty: boolean;
  hasUpstream: boolean;
  unpushedCommits: number;
  prUrl: string | null | undefined;
  lastCommitMessage: string | null;
}): { plainStatus: string; nextStep: string } {
  if (input.status === "orphaned") {
    return {
      plainStatus: "Folder missing",
      nextStep: "Start this worker again, or remove it.",
    };
  }
  if (input.status === "pr_open" || input.prUrl) {
    return {
      plainStatus: "Pull request open",
      nextStep: "Review the pull request, or keep working in the folder.",
    };
  }
  if (input.status === "merged") {
    return {
      plainStatus: "Merged",
      nextStep: "Nothing left — you can remove this worker.",
    };
  }
  if (!input.hasUpstream && input.commitsAhead > 0) {
    return {
      plainStatus: `${input.commitsAhead} new commit${input.commitsAhead === 1 ? "" : "s"}${input.dirty ? " · plus local edits" : ""}`,
      nextStep: "Open a pull request from this desk, or push the branch.",
    };
  }
  if (input.hasUpstream && input.unpushedCommits > 0) {
    return {
      plainStatus: `${input.unpushedCommits} commit${input.unpushedCommits === 1 ? "" : "s"} not pushed${input.dirty ? " · plus local edits" : ""}`,
      nextStep: "Push from the worker, or open a pull request here (it can push).",
    };
  }
  if (input.commitsAhead > 0) {
    return {
      plainStatus: `${input.commitsAhead} commit${input.commitsAhead === 1 ? "" : "s"} ahead of main${input.dirty ? " · plus local edits" : ""}`,
      nextStep: "Open a pull request from this desk when you’re ready.",
    };
  }
  if (input.dirty) {
    return {
      plainStatus: "Unfinished local edits",
      nextStep: "In the worker chat: commit (and push). Then come back here.",
    };
  }
  if (input.lastCommitMessage) {
    return {
      plainStatus: "Quiet — same as main so far",
      nextStep: "Ask the worker to make a change, then come back.",
    };
  }
  return {
    plainStatus: "Waiting",
    nextStep: "Open the worker folder in Cursor and give it a job.",
  };
}

/** Read live git facts from a worker folder for the desk map. */
export async function probeLaneActivity(
  node: WorktreeNode,
  baseBranch: string,
): Promise<LaneLiveFacts> {
  if (node.status === "orphaned") {
    const copy = plainCopy({
      status: node.status,
      commitsAhead: 0,
      dirty: false,
      hasUpstream: false,
      unpushedCommits: 0,
      prUrl: node.prUrl,
      lastCommitMessage: null,
    });
    return {
      headSha: node.anchorSha,
      shortSha: shortSha(node.anchorSha),
      commitsAhead: 0,
      dirty: false,
      lastCommitMessage: null,
      hasUpstream: false,
      unpushedCommits: 0,
      ...copy,
    };
  }

  const cwd = node.path;
  const headSha = await gitStdout(cwd, ["rev-parse", "HEAD"]).catch(
    () => node.anchorSha,
  );
  const lastCommitMessage = await gitStdout(cwd, [
    "log",
    "-1",
    "--format=%s",
  ]).catch(() => null);
  const [dirty, commitsAhead, upstream] = await Promise.all([
    isMeaningfulDirty(cwd),
    commitsAheadOf(cwd, baseBranch),
    upstreamFacts(cwd),
  ]);

  const copy = plainCopy({
    status: node.status,
    commitsAhead,
    dirty,
    hasUpstream: upstream.hasUpstream,
    unpushedCommits: upstream.unpushedCommits,
    prUrl: node.prUrl,
    lastCommitMessage,
  });

  return {
    headSha,
    shortSha: shortSha(headSha),
    commitsAhead,
    dirty,
    lastCommitMessage,
    hasUpstream: upstream.hasUpstream,
    unpushedCommits: upstream.unpushedCommits,
    ...copy,
  };
}
