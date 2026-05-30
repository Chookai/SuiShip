"use client";

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const AGENT_MODE = process.env.NEXT_PUBLIC_CHAT_AGENT_MODE === "true";

interface ToolCall {
  name: string;
  inputJson: string | null;
  resultJson: string | null;
  isError: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  // client-only: tool events received from the agent route on the current turn
  pendingToolEvents?: Array<{ name: string; input: unknown; result: unknown }>;
}

// ── Tool call inline card ─────────────────────────────────────────────────────

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  let parsedResult: unknown = null;
  try {
    parsedResult = toolCall.resultJson ? JSON.parse(toolCall.resultJson) : null;
  } catch {
    parsedResult = toolCall.resultJson;
  }
  let parsedInput: unknown = null;
  try {
    parsedInput = toolCall.inputJson ? JSON.parse(toolCall.inputJson) : null;
  } catch {
    parsedInput = toolCall.inputJson;
  }

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-xs",
        toolCall.isError
          ? "border-red-100 bg-red-50"
          : "border-blue-100 bg-blue-50/60"
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left font-semibold text-steel hover:text-pearl"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="font-mono">{toolCall.name}</span>
        {toolCall.isError ? (
          <XCircle className="ml-auto h-3 w-3 shrink-0 text-red-500" />
        ) : (
          <CheckCircle2 className="ml-auto h-3 w-3 shrink-0 text-emerald-500" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {parsedInput !== null && Object.keys(parsedInput as object).length > 0 && (
            <div>
              <p className="font-semibold text-steel/70">Input</p>
              <pre className="mt-0.5 max-h-28 overflow-auto whitespace-pre-wrap break-all text-[10px] text-pearl">
                {JSON.stringify(parsedInput, null, 2)}
              </pre>
            </div>
          )}
          {parsedResult !== null && (
            <div>
              <p className="font-semibold text-steel/70">Result</p>
              <pre className="mt-0.5 max-h-36 overflow-auto whitespace-pre-wrap break-all text-[10px] text-pearl">
                {JSON.stringify(parsedResult, null, 2).slice(0, 800)}
                {JSON.stringify(parsedResult).length > 800 ? "\n… (truncated)" : ""}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Endorsement proposal card ─────────────────────────────────────────────────

function EndorsementProposalCard({
  proposal,
  shipmentId,
}: {
  proposal: {
    role: string;
    action: string;
    reasoning: string;
    prerequisitesMet: boolean;
    blockingReasons?: string[];
    nextRequiredStep?: { role: string; action: string; label: string } | null;
  };
  shipmentId: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="rounded-xl border border-[#4DA2FF]/40 bg-blue-50 px-3 py-3 text-xs">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#4DA2FF]" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-pearl">Endorsement Proposal</p>
          <p className="mt-0.5 text-steel">
            <span className="font-semibold capitalize">{proposal.role.replace(/_/g, " ")}</span>
            {" → "}
            <span className="font-semibold">{proposal.action.replace(/_/g, " ")}</span>
          </p>
          <p className="mt-1 text-steel/80">{proposal.reasoning}</p>
          {proposal.blockingReasons && proposal.blockingReasons.length > 0 && (
            <p className="mt-1 font-semibold text-amber-600">
              ⚠ {proposal.blockingReasons[0]}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <a
          href={`/shipments/${encodeURIComponent(shipmentId)}#endorsement`}
          className="flex items-center gap-1 rounded-lg bg-[#4DA2FF] px-3 py-1.5 font-semibold text-white transition hover:bg-[#3d8fe8]"
        >
          <ExternalLink className="h-3 w-3" />
          Confirm &amp; Sign
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-lg border border-blue-100 px-3 py-1.5 font-semibold text-steel transition hover:bg-white"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Case summary card ─────────────────────────────────────────────────────────

function CaseSummaryCard({
  result,
}: {
  result: {
    available: boolean;
    caseFileId?: string;
    finalDecision?: string;
    riskLevel?: string;
    customsReadinessScore?: number;
    walrusBlobId?: string | null;
    walrusJsonBlobId?: string | null;
    walrusMarkdownBlobId?: string | null;
    generatedAt?: string;
    message?: string;
  };
}) {
  if (!result.available) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        {result.message ?? "No case file available."}
      </div>
    );
  }

  const blobId = result.walrusBlobId ?? result.walrusJsonBlobId;
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs">
      <p className="font-bold text-emerald-800">Case File Ready</p>
      <p className="mt-0.5 text-emerald-700">
        Decision: <span className="font-semibold capitalize">{result.finalDecision?.replace(/_/g, " ")}</span>{" "}
        · Risk: <span className="font-semibold capitalize">{result.riskLevel}</span>{" "}
        · Score: <span className="font-semibold">{result.customsReadinessScore}</span>
      </p>
      {blobId && (
        <a
          href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 flex items-center gap-1 font-semibold text-emerald-700 underline hover:text-emerald-900"
        >
          <ExternalLink className="h-3 w-3" />
          View on Walrus
        </a>
      )}
    </div>
  );
}

// ── Message renderer ──────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  shipmentId,
}: {
  msg: ChatMessage;
  shipmentId: string;
}) {
  const toolCalls = msg.toolCalls ?? msg.pendingToolEvents?.map((e) => ({
    name: e.name,
    inputJson: JSON.stringify(e.input),
    resultJson: JSON.stringify(e.result),
    isError: typeof e.result === "object" && e.result !== null && "error" in (e.result as Record<string, unknown>),
  }));

  // Look for endorsement proposal and case summary in tool results
  const endorsementProposal = toolCalls?.find((tc) => {
    try {
      const r = tc.resultJson ? JSON.parse(tc.resultJson) : null;
      return r?.kind === "endorsement_proposal";
    } catch { return false; }
  });
  const caseSummary = toolCalls?.find((tc) => tc.name === "generate_case_summary");

  const endorsementData = endorsementProposal?.resultJson
    ? (() => { try { return JSON.parse(endorsementProposal.resultJson); } catch { return null; } })()
    : null;
  const caseData = caseSummary?.resultJson
    ? (() => { try { return JSON.parse(caseSummary.resultJson); } catch { return null; } })()
    : null;

  return (
    <div className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
      <div className="flex max-w-[90%] flex-col gap-1.5">
        {/* Tool call cards (collapsed by default) */}
        {msg.role === "assistant" && toolCalls && toolCalls.length > 0 && (
          <div className="flex flex-col gap-1">
            {toolCalls
              .filter((tc) => tc.name !== "generate_case_summary" || !caseData)
              .filter((tc) => {
                try {
                  const r = tc.resultJson ? JSON.parse(tc.resultJson) : null;
                  return r?.kind !== "endorsement_proposal";
                } catch { return true; }
              })
              .map((tc, i) => (
                <ToolCallCard key={i} toolCall={tc} />
              ))}
          </div>
        )}

        {/* Endorsement proposal action card */}
        {endorsementData && (
          <EndorsementProposalCard proposal={endorsementData} shipmentId={shipmentId} />
        )}

        {/* Case summary card */}
        {caseData && <CaseSummaryCard result={caseData} />}

        {/* Main text bubble */}
        {msg.content && (
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              msg.role === "user"
                ? "rounded-br-md bg-sui text-white"
                : "rounded-bl-md border border-blue-100 bg-blue-50 text-pearl"
            )}
          >
            {msg.content}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main chatbot component ────────────────────────────────────────────────────

export function ShipmentChatbot({ shipmentId }: { shipmentId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    if (historyLoaded) return;
    setHistoryLoaded(true);
    fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/chat/history`)
      .then((r) => r.json())
      .then((data: { messages?: ChatMessage[] }) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {/* history unavailable — start fresh */});
  }, [shipmentId, historyLoaded]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setActiveTool(null);

    try {
      if (AGENT_MODE) {
        const res = await fetch(
          `/api/shipments/${encodeURIComponent(shipmentId)}/chat/agent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
          }
        );
        const data = await res.json() as {
          reply?: string;
          error?: string;
          toolEvents?: Array<{ name: string; input: unknown; result: unknown }>;
        };
        const reply = data.reply ?? data.error ?? "Sorry, something went wrong.";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: reply,
            pendingToolEvents: data.toolEvents ?? [],
          },
        ]);
      } else {
        const res = await fetch(
          `/api/shipments/${encodeURIComponent(shipmentId)}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, history: messages.slice(-10) }),
          }
        );
        const data = await res.json() as { reply?: string; error?: string };
        const reply = data.reply ?? data.error ?? "Sorry, something went wrong.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — please try again." },
      ]);
    } finally {
      setLoading(false);
      setActiveTool(null);
    }
  }

  async function clearHistory() {
    if (!AGENT_MODE) return;
    try {
      await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/chat/history`, {
        method: "DELETE",
      });
      setMessages([]);
    } catch {/* ignore */}
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sui text-white shadow-lg transition hover:scale-105 hover:bg-sui/90 active:scale-95"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-blue-100 bg-gradient-to-r from-sui to-blue-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-white" />
              <span className="text-sm font-bold text-white">
                Ask SuiShip{AGENT_MODE ? " (Agent)" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {AGENT_MODE && messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearHistory()}
                  title="Clear chat history"
                  className="rounded-lg p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-white/80 transition hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bot className="h-10 w-10 text-blue-200" />
                <p className="mt-3 text-sm font-semibold text-steel">
                  Ask me anything about this shipment
                </p>
                <p className="mt-1 text-xs text-steel/70">
                  {AGENT_MODE
                    ? "I can run risk scans, check MemWal history, and propose endorsements."
                    : 'e.g. "Did the importer change their bank?"'}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {(AGENT_MODE
                    ? [
                        "What are the risks?",
                        "Did bank details change?",
                        "What's the next endorsement?",
                      ]
                    : [
                        "Any critical findings?",
                        "Did bank details change?",
                        "Summarize the validation",
                      ]
                  ).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setInput(q);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-sui transition hover:bg-blue-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} shipmentId={shipmentId} />
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-sm text-steel">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {activeTool ? `Calling: ${activeTool}…` : "Thinking…"}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-center gap-2 border-t border-blue-100 bg-white px-3 py-3"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this shipment…"
              disabled={loading}
              className="flex-1 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-sm text-pearl placeholder:text-steel/50 focus:border-sui focus:outline-none focus:ring-1 focus:ring-sui/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sui text-white transition hover:bg-sui/90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
