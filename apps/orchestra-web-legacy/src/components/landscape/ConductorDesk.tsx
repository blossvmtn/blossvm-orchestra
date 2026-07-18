"use client";

import Image from "next/image";
import { useState } from "react";

import { DeskChat } from "~/components/landscape/DeskChat";
import { api } from "~/trpc/react";
import type { SyncLog } from "~/server/orchestra/schemas";

type Props = {
  onSyncLog: (log: SyncLog) => void;
  repoId: string | null;
  useFixture: boolean;
};

type DeskTab = "chat" | "tools";

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

export function ConductorDesk({ onSyncLog, repoId, useFixture }: Props) {
  const [tab, setTab] = useState<DeskTab>("chat");
  const [draft, setDraft] = useState("");
  const [compiled, setCompiled] = useState("");
  const [clerkNote, setClerkNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const statusQuery = api.hermes.status.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const parseMut = api.packet.parseSyncLog.useMutation();
  const compileMut = api.packet.compileSyncLog.useMutation();
  const liaiseMut = api.hermes.liaise.useMutation();
  const parsePacketMut = api.packet.parse.useMutation();
  const briefMut = api.hermes.compilePrBrief.useMutation();
  const worktreeList = api.worktree.list.useQuery(
    { repoId: repoId! },
    { enabled: Boolean(repoId) && !useFixture },
  );

  async function handleParse() {
    setError(null);
    setCopied(false);
    setClerkNote(null);
    try {
      const log = await parseMut.mutateAsync({ rawMarkdown: draft });
      onSyncLog(log);
      const { markdown } = await compileMut.mutateAsync({ payload: log });
      setCompiled(markdown);
      setClerkNote("Got it — status updated above.");
    } catch (err) {
      setError(errText(err, "Could not read that update."));
    }
  }

  async function handlePackageLanes() {
    setError(null);
    setCopied(false);
    try {
      const result = await liaiseMut.mutateAsync({
        repoId: repoId ?? undefined,
        useFixture,
        intent: "summarize_lanes",
      });
      setCompiled(result.markdown);
      setClerkNote(
        result.deterministic
          ? "Here is a plain summary of every branch."
          : "Hermes wrote this summary for you.",
      );
      await parsePacketMut.mutateAsync({ rawMarkdown: result.markdown });
    } catch (err) {
      setError(errText(err, "Could not summarize the branches."));
    }
  }

  async function handleOverride() {
    setError(null);
    setCopied(false);
    try {
      const result = await liaiseMut.mutateAsync({
        repoId: repoId ?? undefined,
        useFixture,
        intent: "draft_override",
        instruction: "Stay in your assigned files. Do not wander.",
      });
      setCompiled(result.markdown);
      setClerkNote("Ready to copy — send this note to every worker.");
      await parsePacketMut.mutateAsync({ rawMarkdown: result.markdown });
    } catch (err) {
      setError(errText(err, "Could not write that note."));
    }
  }

  async function handlePrBrief() {
    setError(null);
    setCopied(false);
    const prNode = worktreeList.data?.find((n) => n.prUrl);
    if (!repoId || !prNode) {
      setError("No open pull request yet. Open one from a branch first.");
      return;
    }
    try {
      const { markdown } = await briefMut.mutateAsync({
        repoId,
        nodeId: prNode.id,
      });
      setCompiled(markdown);
      setClerkNote(`Short PR note for ${prNode.slug}.`);
      await parsePacketMut.mutateAsync({ rawMarkdown: markdown });
    } catch (err) {
      setError(errText(err, "Could not write the PR note."));
    }
  }

  async function handleCopy() {
    if (!compiled) return;
    await navigator.clipboard.writeText(compiled);
    setCopied(true);
  }

  function handleClear() {
    setDraft("");
    setCompiled("");
    setError(null);
    setCopied(false);
    setClerkNote(null);
  }

  const helperOnline = Boolean(statusQuery.data?.reachable);

  return (
    <section
      aria-label="Your desk"
      className="relative border-t border-white/10 bg-[color:var(--color-desk)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-30"
        style={{
          backgroundImage: "url(/theme/petal-mist.png)",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          maskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />

      <div className="relative z-10 px-6 pt-5 pb-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-[color:var(--color-brass)] uppercase">
              Your desk
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-white/95">
              {tab === "chat"
                ? "Talk it through here"
                : "Paste an update. Get something you can copy."}
            </h2>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setTab("chat")}
                className={`px-3 py-1.5 text-sm ${
                  tab === "chat"
                    ? "border border-[color:var(--color-brass)]/50 bg-[color:var(--color-brass)]/15 text-[color:var(--color-brass)]"
                    : "border border-white/15 text-white/45"
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setTab("tools")}
                className={`px-3 py-1.5 text-sm ${
                  tab === "tools"
                    ? "border border-[color:var(--color-brass)]/50 bg-[color:var(--color-brass)]/15 text-[color:var(--color-brass)]"
                    : "border border-white/15 text-white/45"
                }`}
              >
                Copy tools
              </button>
            </div>
          </div>
          <div className="relative hidden h-14 w-14 overflow-hidden rounded-full ring-1 ring-[color:var(--color-petal)]/30 sm:block">
            <Image
              src="/theme/crown-blossom.png"
              alt=""
              fill
              sizes="56px"
              className="object-cover opacity-80"
            />
          </div>
        </div>

        {tab === "chat" ? <DeskChat /> : null}

        {tab === "tools" ? (
          <>
            <p className="mb-4 text-sm text-white/45">
              Local helper:{" "}
              <span
                className={
                  helperOnline
                    ? "text-[color:var(--color-status-merged)]"
                    : "text-[color:var(--color-status-stashed)]"
                }
              >
                {helperOnline ? "on" : "off"}
              </span>
              {helperOnline && statusQuery.data?.model
                ? ` (${statusQuery.data.model})`
                : null}
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-white/55">
                  Paste a worker update here
                </span>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  placeholder="Paste text from a worker here…"
                  className="h-48 w-full resize-y border border-white/10 bg-black/35 p-3 font-mono text-xs leading-relaxed text-[color:var(--color-petal)] outline-none focus:border-[color:var(--color-blossom)]/50"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-white/55">
                  Result (copy this)
                </span>
                <textarea
                  value={compiled}
                  readOnly
                  spellCheck={false}
                  placeholder="Clean text to copy shows up here"
                  className="h-48 w-full resize-y border border-white/10 bg-black/20 p-3 font-mono text-xs leading-relaxed text-white/70 outline-none"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleParse()}
                disabled={!draft.trim() || parseMut.isPending}
                className="border border-[color:var(--color-petal)]/40 bg-[color:var(--color-petal)]/15 px-4 py-2 text-sm text-[color:var(--color-petal)] transition hover:bg-[color:var(--color-petal)]/25 disabled:opacity-40"
              >
                {parseMut.isPending ? "Reading…" : "Read update"}
              </button>
              <button
                type="button"
                onClick={() => void handlePackageLanes()}
                disabled={liaiseMut.isPending}
                className="border border-[color:var(--color-brass)]/50 bg-[color:var(--color-brass)]/15 px-4 py-2 text-sm text-[color:var(--color-brass)] transition hover:bg-[color:var(--color-brass)]/25 disabled:opacity-40"
              >
                {liaiseMut.isPending ? "Working…" : "Summarize all branches"}
              </button>
              <button
                type="button"
                onClick={() => void handleOverride()}
                disabled={liaiseMut.isPending}
                className="border border-white/20 px-4 py-2 text-sm text-white/70 transition hover:border-white/35 disabled:opacity-40"
              >
                Write a note to everyone
              </button>
              <button
                type="button"
                onClick={() => void handlePrBrief()}
                disabled={briefMut.isPending || !repoId || useFixture}
                className="border border-white/20 px-4 py-2 text-sm text-white/70 transition hover:border-white/35 disabled:opacity-40"
              >
                Write a PR note
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!compiled}
                className="border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-40"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="border border-white/15 px-4 py-2 text-sm text-white/55 transition hover:border-white/30 hover:text-white/80"
              >
                Clear
              </button>
              {error ? (
                <p className="text-sm text-[color:var(--color-status-orphaned)]">
                  {error}
                </p>
              ) : null}
              {clerkNote && !error ? (
                <p className="max-w-xl text-sm text-white/45">{clerkNote}</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
