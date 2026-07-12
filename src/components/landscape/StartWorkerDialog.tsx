"use client";

import { useMemo, useState } from "react";

import { api } from "~/trpc/react";

type Props = {
  open: boolean;
  repoId: string;
  onClose: () => void;
  onCreated: (info: { slug: string; path: string }) => void;
};

function toSlug(raw: string): string {
  return (
    raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "worker"
  );
}

export function StartWorkerDialog({
  open,
  repoId,
  onClose,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [folders, setFolders] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMut = api.worktree.create.useMutation();
  const utils = api.useUtils();

  const slug = useMemo(() => toSlug(name), [name]);
  const branch = `orchestra/${slug}`;

  if (!open) return null;

  async function handleCreate() {
    setError(null);
    setCopied(false);
    const allowedPaths = folders
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const node = await createMut.mutateAsync({
        repoId,
        slug,
        branch,
        allowedPaths: allowedPaths.length > 0 ? allowedPaths : ["**"],
        forbiddenPaths: [],
      });
      await utils.scan.trunk.invalidate({ repoId });
      await utils.worktree.list.invalidate({ repoId });
      setCreatedPath(node.path);
      onCreated({ slug: node.slug, path: node.path });
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Could not start that worker.";
      setError(msg);
    }
  }

  async function copyPath() {
    if (!createdPath) return;
    await navigator.clipboard.writeText(createdPath);
    setCopied(true);
  }

  function handleClose() {
    setName("");
    setFolders("");
    setError(null);
    setCreatedPath(null);
    setCopied(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Start a worker"
    >
      <div className="w-full max-w-md border border-white/15 bg-[color:var(--color-charcoal)] p-5 shadow-2xl">
        <p className="text-[10px] tracking-[0.3em] text-[color:var(--color-petal)] uppercase">
          blossvm-orchestra
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
          {createdPath ? "Worker ready" : "Start a worker"}
        </h2>

        {!createdPath ? (
          <>
            <p className="mt-2 text-sm text-white/60">
              This makes a private folder + branch for one job. Then you open that
              folder in Cursor — that chat is the worker.
            </p>

            <label className="mt-4 block">
              <span className="mb-1 block text-sm text-white/55">
                Short name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="fix-login"
                autoFocus
                className="w-full border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--color-blossom)]/50"
              />
            </label>
            <p className="mt-1 text-xs text-white/35">
              Branch will be: {name.trim() ? branch : "orchestra/…"}
            </p>

            <label className="mt-4 block">
              <span className="mb-1 block text-sm text-white/55">
                Folders they may touch (optional)
              </span>
              <input
                value={folders}
                onChange={(e) => setFolders(e.target.value)}
                placeholder="src/app/**, docs/**"
                className="w-full border border-white/15 bg-black/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-[color:var(--color-blossom)]/50"
              />
            </label>
            <p className="mt-1 text-xs text-white/35">
              Leave blank to allow the whole project for now.
            </p>

            {error ? (
              <p className="mt-3 text-sm text-[color:var(--color-status-orphaned)]">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!name.trim() || createMut.isPending}
                className="border border-[color:var(--color-petal)]/40 bg-[color:var(--color-petal)]/15 px-4 py-2 text-sm text-[color:var(--color-petal)] disabled:opacity-40"
              >
                {createMut.isPending ? "Starting…" : "Start worker"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="border border-white/15 px-4 py-2 text-sm text-white/55"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/60">
              Open this folder in Cursor as a new window or chat. That session is
              the worker. Come back here when you want a summary or a PR.
            </p>
            <p className="mt-4 break-all border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-[color:var(--color-petal)]">
              {createdPath}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyPath()}
                className="border border-[color:var(--color-brass)]/50 bg-[color:var(--color-brass)]/15 px-4 py-2 text-sm text-[color:var(--color-brass)]"
              >
                {copied ? "Copied" : "Copy folder path"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="border border-white/15 px-4 py-2 text-sm text-white/55"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
