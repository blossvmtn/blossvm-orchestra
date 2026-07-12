"use client";

import { useState } from "react";

import { api } from "~/trpc/react";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdded: (repoId: string) => void;
};

export function AddProjectDialog({ open, onClose, onAdded }: Props) {
  const [repoPath, setRepoPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addMut = api.registry.add.useMutation();
  const utils = api.useUtils();

  if (!open) return null;

  async function handleAdd() {
    setError(null);
    try {
      const entry = await addMut.mutateAsync({ rootPath: repoPath.trim() });
      await utils.registry.list.invalidate();
      setRepoPath("");
      onAdded(entry.id);
      onClose();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Could not add that project.";
      setError(msg);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add a project"
    >
      <div className="w-full max-w-md border border-white/15 bg-[color:var(--color-charcoal)] p-5 shadow-2xl">
        <p className="text-[10px] tracking-[0.3em] text-[color:var(--color-petal)] uppercase">
          blossvm-orchestra
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
          Add another project
        </h2>
        <p className="mt-2 text-sm text-white/60">
          You can watch more than one. Type the GitHub name or the folder on your
          Mac.
        </p>

        <input
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && repoPath.trim()) void handleAdd();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            const anyFile = f as File & { path?: string };
            if (anyFile?.path) setRepoPath(anyFile.path);
            else if (f?.name) setRepoPath(f.name);
          }}
          placeholder="blossvmtn/construction-os"
          autoFocus
          className="mt-4 w-full border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-[color:var(--color-blossom)]/50"
        />
        <p className="mt-2 text-xs text-white/35">
          Examples: blossvmtn/tenjo-os · ~/dev/construction-os
        </p>

        {error ? (
          <p className="mt-3 text-sm text-[color:var(--color-status-orphaned)]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!repoPath.trim() || addMut.isPending}
            className="border border-[color:var(--color-petal)]/40 bg-[color:var(--color-petal)]/15 px-4 py-2 text-sm text-[color:var(--color-petal)] disabled:opacity-40"
          >
            {addMut.isPending ? "Adding…" : "Add project"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-white/15 px-4 py-2 text-sm text-white/55"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
