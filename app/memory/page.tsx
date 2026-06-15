"use client";

import { Brain } from "lucide-react";
import { useMemo, useState } from "react";
import { MemoryInspectorPanel } from "@/components/MemoryInspectorPanel";
import { Panel } from "@/components/ui";
import { useShipments } from "@/lib/shipments-store";

export default function MemoryInspectorPage() {
  const { shipments } = useShipments();
  const [selectedId, setSelectedId] = useState<string>("");

  const sortedShipments = useMemo(
    () => [...shipments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [shipments]
  );

  const selectedShipment = sortedShipments.find((s) => s.id === selectedId) ?? sortedShipments[0];

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 lg:px-10">
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sui/25 bg-sui/10 px-3 py-1 text-sm text-sui">
          <Brain className="h-4 w-4" />
          Developer Tooling
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-pearl">Memory &amp; Artifact Inspector</h1>
        <p className="mt-3 max-w-2xl text-steel">
          Browse what the validation agent remembers about each exporter — party identity, document fingerprints, and
          cross-shipment provenance anchored to MemWal, Walrus, and Sui.
        </p>
      </div>

      {sortedShipments.length === 0 ? (
        <Panel>
          <p className="text-sm text-steel">No shipments yet. Create a shipment and run validation to populate memory.</p>
        </Panel>
      ) : (
        <div className="grid gap-6">
          <Panel className="flex flex-wrap items-center gap-4">
            <label className="text-sm font-bold text-pearl" htmlFor="shipment-select">
              Inspect shipment
            </label>
            <select
              id="shipment-select"
              value={selectedId || selectedShipment?.id || ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-xl border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-pearl outline-none focus:border-sui"
            >
              {sortedShipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.exporter.company} → {s.importer.company}
                </option>
              ))}
            </select>
          </Panel>

          {selectedShipment && (
            <MemoryInspectorPanel shipment={selectedShipment} />
          )}
        </div>
      )}
    </div>
  );
}
