import { Brain, FileText, History, Route, ShieldAlert, Sparkles } from "lucide-react";
import { Panel, StatusBadge } from "@/components/ui";
import { memorySignals } from "@/lib/demo-data";

const icons = [Sparkles, History, Route, FileText, ShieldAlert];

export default function MemoryLayerPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.25em] text-sui">Memory layer demo</p>
        <h1 className="mt-3 text-4xl font-semibold text-pearl">memWal learns from every document workflow</h1>
        <p className="mt-3 text-steel">This first prototype shows the memory concept without a real memWal integration: reusable document intelligence for routes, suppliers, corrections, and fraud signals.</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel className="h-fit">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-sui" />
            <h2 className="text-xl font-semibold text-pearl">Conceptual memory index</h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-steel">
            SuiShip would use memory to improve extraction and risk checks over time while keeping proofs anchored to Sui and documents stored off-chain.
          </p>
          <div className="mt-5 grid gap-3">
            {["Mocked in prototype", "Walrus-ready references", "Human corrections tracked", "Future production integration"].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-lg bg-white/6 p-3">
                <span className="text-sm text-pearl">{item}</span>
                <StatusBadge value="Visible" />
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-4">
          {memorySignals.map((signal, index) => {
            const Icon = icons[index];
            return (
              <Panel key={signal.title}>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="flex gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-sui/25 bg-sui/10">
                      <Icon className="h-5 w-5 text-sui" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-pearl">{signal.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-steel">{signal.detail}</p>
                    </div>
                  </div>
                  <span className="min-w-fit rounded-full border border-white/10 bg-white/8 px-3 py-1 text-sm text-pearl">{signal.score}</span>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    </div>
  );
}
