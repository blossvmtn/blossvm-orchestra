"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "~/trpc/react";

type ChatRole = "user" | "assistant";

type ChatTurn = {
  id: string;
  role: ChatRole;
  content: string;
};

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

export function DeskChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: "hello",
      role: "assistant",
      content:
        "Hi. Ask me anything about this desk, your branches, or what to do next. I stay on your Mac.",
    },
  ]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const statusQuery = api.hermes.status.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const chatMut = api.hermes.chat.useMutation();

  const helperOn = Boolean(statusQuery.data?.reachable);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, chatMut.isPending]);

  async function send() {
    const text = input.trim();
    if (!text || chatMut.isPending) return;

    setError(null);
    setInput("");

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);

    try {
      const history = nextTurns
        .filter((t) => t.id !== "hello")
        .map((t) => ({ role: t.role, content: t.content }));

      const result = await chatMut.mutateAsync({ messages: history });
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.content.trim() || "(No reply — try again.)",
        },
      ]);
    } catch (err) {
      setError(
        errText(
          err,
          helperOn
            ? "Could not get a reply. Try again in a moment."
            : "Local helper is off. Start Ollama, then try again.",
        ),
      );
    }
  }

  return (
    <section
      aria-label="Talk here"
      className="flex min-h-[320px] flex-col border border-white/10 bg-black/25"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[10px] tracking-[0.3em] text-[color:var(--color-brass)] uppercase">
            Talk here
          </p>
          <p className="mt-0.5 text-sm text-white/55">
            Same kind of chat — on your machine
          </p>
        </div>
        <p className="text-xs text-white/40">
          Helper:{" "}
          <span
            className={
              helperOn
                ? "text-[color:var(--color-status-merged)]"
                : "text-[color:var(--color-status-stashed)]"
            }
          >
            {helperOn ? "on" : "off"}
          </span>
          {helperOn && statusQuery.data?.model
            ? ` · ${statusQuery.data.model}`
            : null}
        </p>
      </header>

      <div className="flex max-h-[360px] min-h-[220px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={
              turn.role === "user"
                ? "ml-8 self-end border border-[color:var(--color-petal)]/25 bg-[color:var(--color-petal)]/10 px-3 py-2 text-sm text-white/90"
                : "mr-8 self-start border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-white/75"
            }
          >
            {turn.content}
          </div>
        ))}
        {chatMut.isPending ? (
          <p className="text-sm text-white/40">Thinking… (first reply can take a bit)</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="px-4 pb-2 text-sm text-[color:var(--color-status-orphaned)]">
          {error}
        </p>
      ) : null}

      <form
        className="flex gap-2 border-t border-white/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            helperOn
              ? "Ask anything…"
              : "Start Ollama first, then type here…"
          }
          disabled={chatMut.isPending}
          className="min-w-0 flex-1 border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--color-blossom)]/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || chatMut.isPending || !helperOn}
          className="border border-[color:var(--color-brass)]/50 bg-[color:var(--color-brass)]/15 px-4 py-2 text-sm text-[color:var(--color-brass)] disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}
