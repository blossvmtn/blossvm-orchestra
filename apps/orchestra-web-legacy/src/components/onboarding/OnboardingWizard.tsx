"use client";

import { useMemo, useState } from "react";

import { api } from "~/trpc/react";

type Props = {
  open: boolean;
  onClose: () => void;
  onAnchored: (repoId: string) => void;
};

const STEPS = ["Check tools", "Local AI", "Pick project", "Tips"] as const;

export function OnboardingWizard({ open, onClose, onAnchored }: Props) {
  const [step, setStep] = useState(0);
  const [repoPath, setRepoPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedCard, setCopiedCard] = useState<string | null>(null);
  const [skippedClerk, setSkippedClerk] = useState(false);

  const detectQuery = api.onboarding.detect.useQuery(undefined, {
    enabled: open,
  });
  const cardsQuery = api.onboarding.mcpCards.useQuery(undefined, {
    enabled: open && step >= 3,
  });
  const pinMut = api.onboarding.pinHermes.useMutation();
  const anchorMut = api.onboarding.anchorRepo.useMutation();
  const completeMut = api.onboarding.complete.useMutation();
  const utils = api.useUtils();

  const detect = detectQuery.data;

  const detectRows = useMemo(() => {
    if (!detect) return [];
    return [
      {
        label: "Git",
        ok: detect.git.ok,
        detail: detect.git.ok ? "Ready" : "Not found — install git",
      },
      {
        label: "GitHub (gh)",
        ok: detect.gh.ok && detect.gh.authenticated,
        detail: !detect.gh.ok
          ? "Not found — install GitHub CLI"
          : detect.gh.authenticated
            ? "Signed in"
            : "Installed, but not signed in",
      },
      {
        label: "Cursor",
        ok: detect.cursor.ok,
        detail: detect.cursor.ok ? "Found" : "Optional — not found",
      },
      {
        label: "Local AI (Ollama)",
        ok: detect.ollama.ok,
        detail: !detect.ollama.ok
          ? "Offline"
          : detect.ollama.pinPresent
            ? "Ready (preferred model found)"
            : "On, but preferred model not downloaded yet",
      },
    ];
  }, [detect]);

  if (!open) return null;

  async function handlePin(skip = false) {
    setError(null);
    try {
      await pinMut.mutateAsync({ skip });
      setSkippedClerk(skip);
      setStep(2);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save that setting.",
      );
    }
  }

  async function handleAnchor() {
    setError(null);
    try {
      const entry = await anchorMut.mutateAsync({ rootPath: repoPath.trim() });
      await utils.registry.list.invalidate();
      onAnchored(entry.id);
      setStep(3);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Could not open that project.";
      setError(msg);
    }
  }

  async function handleFinish() {
    setError(null);
    try {
      await completeMut.mutateAsync({ skippedClerk });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not finish setup.",
      );
    }
  }

  async function copyCard(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedCard(id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Setup"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto border border-white/15 bg-[color:var(--color-charcoal)] shadow-2xl">
        <div
          className="relative h-28 overflow-hidden border-b border-white/10"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(11,15,20,0.2), rgba(11,15,20,0.92)), url(/theme/cinematic-frame.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 flex flex-col justify-end p-5">
            <p className="text-[10px] tracking-[0.3em] text-[color:var(--color-petal)] uppercase">
              blossvm-orchestra
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
              Quick setup — 4 steps
            </h2>
          </div>
        </div>

        <ol className="flex gap-1 border-b border-white/10 px-5 py-3">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`flex-1 text-center text-[10px] ${
                i === step
                  ? "text-[color:var(--color-brass)]"
                  : i < step
                    ? "text-white/50"
                    : "text-white/25"
              }`}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        <div className="space-y-4 p-5">
          {step === 0 ? (
            <>
              <p className="text-sm text-white/65">
                We check a few tools on this Mac. Nothing leaves your machine.
              </p>
              {detectQuery.isLoading ? (
                <p className="text-xs text-white/40">Checking…</p>
              ) : (
                <ul className="space-y-2">
                  {detectRows.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-center justify-between border border-white/10 bg-black/25 px-3 py-2 text-sm"
                    >
                      <span className="text-white/70">{row.label}</span>
                      <span
                        className={
                          row.ok
                            ? "text-[color:var(--color-status-merged)]"
                            : "text-[color:var(--color-status-stashed)]"
                        }
                      >
                        {row.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                disabled={!detect?.readyForOnboarding}
                onClick={() => setStep(1)}
                className="border border-[color:var(--color-petal)]/40 bg-[color:var(--color-petal)]/15 px-4 py-2 text-sm text-[color:var(--color-petal)] disabled:opacity-40"
              >
                Next
              </button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className="text-sm text-white/65">
                Pick the local helper model we prefer:{" "}
                <strong className="text-[color:var(--color-brass)]">
                  gemma4:31b
                </strong>
                . You can skip this and still use the desk.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handlePin(false)}
                  disabled={pinMut.isPending}
                  className="border border-[color:var(--color-brass)]/50 bg-[color:var(--color-brass)]/15 px-4 py-2 text-sm text-[color:var(--color-brass)]"
                >
                  {pinMut.isPending ? "Saving…" : "Use preferred model"}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePin(true)}
                  disabled={pinMut.isPending}
                  className="border border-white/15 px-4 py-2 text-sm text-white/55"
                >
                  Skip for now
                </button>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="text-sm text-white/65">
                Which project should we watch first? You can add more later from
                the top bar. Type the GitHub name or the folder on your Mac.
              </p>
              <input
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  const anyFile = f as File & { path?: string };
                  if (anyFile?.path) setRepoPath(anyFile.path);
                  else if (f?.name) setRepoPath(f.name);
                }}
                placeholder="blossvmtn/tenjo-os"
                className="w-full border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-[color:var(--color-blossom)]/50"
              />
              <p className="text-xs text-white/35">
                Examples: blossvmtn/tenjo-os · ~/dev/tenjo-os · full folder path
              </p>
              <button
                type="button"
                onClick={() => void handleAnchor()}
                disabled={!repoPath.trim() || anchorMut.isPending}
                className="border border-[color:var(--color-petal)]/40 bg-[color:var(--color-petal)]/15 px-4 py-2 text-sm text-[color:var(--color-petal)] disabled:opacity-40"
              >
                {anchorMut.isPending ? "Opening…" : "Open project"}
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="text-sm text-white/65">
                Optional tips you can copy. You do not need to edit any settings
                files.
              </p>
              <ul className="space-y-3">
                {(cardsQuery.data ?? []).map((card) => (
                  <li
                    key={card.id}
                    className="border border-white/10 bg-black/25 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-white/90">{card.title}</p>
                        <p className="mt-1 text-xs text-white/50">{card.blurb}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyCard(card.id, card.copyText)}
                        className="shrink-0 border border-white/20 px-3 py-1 text-xs text-white/70"
                      >
                        {copiedCard === card.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={completeMut.isPending}
                className="border border-[color:var(--color-brass)]/50 bg-[color:var(--color-brass)]/15 px-4 py-2 text-sm text-[color:var(--color-brass)]"
              >
                {completeMut.isPending ? "Saving…" : "Done — open the desk"}
              </button>
            </>
          ) : null}

          {error ? (
            <p className="text-sm text-[color:var(--color-status-orphaned)]">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="text-xs text-white/35 underline-offset-2 hover:text-white/55 hover:underline"
          >
            Close for now
          </button>
        </div>
      </div>
    </div>
  );
}
