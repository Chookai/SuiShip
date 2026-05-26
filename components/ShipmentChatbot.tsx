"use client";

import { MessageCircle, Send, X, Loader2, Bot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ShipmentChatbot({ shipmentId }: { shipmentId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/shipments/${shipmentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10),
        }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.error ?? "Sorry, something went wrong.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sui text-white shadow-lg transition hover:scale-105 hover:bg-sui/90 active:scale-95"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-blue-100 bg-gradient-to-r from-sui to-blue-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-white" />
              <span className="text-sm font-bold text-white">Ask SuiShip</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
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
                  e.g. &quot;Did the importer change their bank?&quot;
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    "Any critical findings?",
                    "Did bank details change?",
                    "Summarize the validation",
                  ].map((q) => (
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
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "rounded-br-md bg-sui text-white"
                      : "rounded-bl-md border border-blue-100 bg-blue-50 text-pearl",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-sm text-steel">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-blue-100 bg-white px-3 py-3"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this shipment..."
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
