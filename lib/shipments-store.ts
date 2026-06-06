"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";

async function syncToServer(record: ShipmentRecord): Promise<void> {
  try {
    await fetch("/api/shipments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  } catch {
    // non-fatal — localStorage remains source of truth
  }
}

async function deleteFromServer(id: string): Promise<void> {
  const response = await fetch(`/api/shipments/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to delete shipment ${id}: ${errorText}`);
  }
}

export type WorkflowKey = "importer" | "exporter";

export type DocumentOwner = "Importer" | "Exporter";

export type DocumentRequirement = {
  name: string;
  owner: DocumentOwner;
  required: boolean;
  uploaded: boolean;
  fileName?: string;
  uploadedAt?: string;
  extractionSource?: "live_haiku" | "cached_haiku" | "mock";
  extractionModel?: string;
  extractionLatencyMs?: number;
  extractionInputTokens?: number;
  extractionOutputTokens?: number;
  extractedAt?: string;
};

export type PartyInfo = {
  company: string;
  contact: string;
  email: string;
  phone: string;
  taxId?: string;
  registeredAddress?: string;
  bankBeneficiaryName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankSwift?: string;
};

export type AiCheckStatus = "matched" | "mismatch" | "missing" | "info";

export type AiCheck = {
  field: string;
  status: AiCheckStatus;
  detail: string;
  documents: string[];
};

export type AiResult = {
  score: number;
  riskLevel: "Low" | "Medium" | "High";
  checks: AiCheck[];
  ranAt: string;
  summary: string;
};

export type WalrusUpload = {
  blobId: string;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  endEpoch?: number;
  publisher: string;
  aggregator: string;
};

export type MintStorageResult = {
  passportId: string;
  txDigest: string;
  mintedAt: string;
  walrusBlobIds: string[];
  memWalSpaceId: string;
  manifestHash: string;
};

export type ProgressManifest = {
  id: string;
  shipmentId: string;
  sequence: number;
  stage: string;
  actor: string;
  summary: string;
  manifestJson: string;
  memwalBlobId?: string;
  memwalNamespace: string;
  status: string;
  createdAt: string;
};

export type ShipmentRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: WorkflowKey;
  initiatorAddress?: string;
  workflow: WorkflowKey;
  status:
    | "Draft"
    | "Awaiting Counterparty"
    | "In Progress"
    | "Documents Uploaded"
    | "AI Verified"
    | "Passport Minted"
    | "Customs Package Generated";
  importer: PartyInfo;
  exporter: PartyInfo;
  notifyParty?: PartyInfo;
  broker?: string;
  freightForwarder?: string;
  shipment: {
    origin: string;
    originPort: string;
    destination: string;
    destinationPort: string;
    carrier: string;
    transportMode: string;
    incoterm: string;
    etd: string;
    eta: string;
    declaredValue: string;
    currency: string;
    bookingRef?: string;
    paymentTerms?: string;
    blType?: string;
  };
  cargo: {
    description: string;
    sku: string;
    hsCode: string;
    quantity: string;
    grossWeight: string;
    netWeight: string;
    handlingUnits: string;
    container: string;
    seal: string;
    countryOfOrigin: string;
    dangerousGoods: string;
    temperatureControlled: string;
  };
  documents: DocumentRequirement[];
  inviteToken?: string;
  ai?: AiResult;
  walrus?: WalrusUpload;
  extractedRef?: string;
  extractionStatus?: "extracting" | "complete" | "failed";
  passportId?: string;
  txDigest?: string;
  memWalSpaceId?: string;
  memWalManifestBlobId?: string;
  memWalSummaryBlobId?: string;
  memWalSyncStatus?: "pending" | "synced" | "failed";
  memWalSyncError?: string;
  memWalSyncedAt?: string;
  walrusManifestBlobId?: string;
  walrusBlobIds?: string[];
  manifestHash?: string;
  mintedAt?: string;
  templateId?: string;
  onChainRecordId?: string;
  onChainAccumulatorId?: string;
  onChainPackageId?: string;
  onChainNetwork?: string;
  progressManifests?: ProgressManifest[];
};

type ShipmentsContextValue = {
  shipments: ShipmentRecord[];
  ready: boolean;
  addShipment: (record: ShipmentRecord) => void;
  updateShipment: (id: string, patch: Partial<ShipmentRecord>) => void;
  removeShipment: (id: string) => void;
  getShipment: (id: string) => ShipmentRecord | undefined;
  clear: () => void;
};

const STORAGE_KEY = "suiship-shipments";
const DELETED_STORAGE_KEY = "suiship-deleted-shipments";

const ShipmentsContext = createContext<ShipmentsContextValue | null>(null);

function loadDeletedIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DELETED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveDeletedIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore quota errors
  }
}

export function ShipmentsProvider({ children }: { children: React.ReactNode }) {
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const deletedIds = loadDeletedIds();

    fetch("/api/shipments")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((server: ShipmentRecord[]) => {
        // Prune stale deletedIds — entries absent from server were already deleted server-side
        const serverIds = new Set(server.map((s) => s.id));
        const stale = [...deletedIds].filter((id) => !serverIds.has(id));
        if (stale.length > 0) {
          stale.forEach((id) => deletedIds.delete(id));
          saveDeletedIds(deletedIds);
        }
        // Only suppress items server still has but we're optimistically deleting locally
        const visible = server.filter((s) => !deletedIds.has(s.id));
        setShipments(visible);
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visible)); } catch {}
        if (process.env.NODE_ENV === "development") {
          console.log(`[SuiShip] Loaded ${visible.length} shipment(s) from server`);
          if (stale.length > 0) console.log(`[SuiShip] Cleared ${stale.length} stale deleted ID(s) from localStorage`);
        }
      })
      .catch(() => {
        // Server unavailable — fall back to localStorage cache
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? (JSON.parse(raw) as ShipmentRecord[]) : [];
          const local = Array.isArray(parsed) ? parsed.filter((s) => !deletedIds.has(s.id)) : [];
          setShipments(local);
          if (process.env.NODE_ENV === "development") {
            console.warn(`[SuiShip] Server unavailable — showing ${local.length} shipment(s) from localStorage cache`);
          }
        } catch {}
      })
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: ShipmentRecord[]) => {
    setShipments(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }, []);

  const value = useMemo<ShipmentsContextValue>(() => {
    return {
      shipments,
      ready,
      addShipment: (record) => {
        const deletedIds = loadDeletedIds();
        deletedIds.delete(record.id);
        saveDeletedIds(deletedIds);
        setShipments((current) => {
          const next = [record, ...current.filter((existing) => existing.id !== record.id)];
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
        syncToServer(record);
      },
      updateShipment: (id, patch) => {
        if (loadDeletedIds().has(id)) return;
        setShipments((current) => {
          let found: ShipmentRecord | undefined;
          const updated = current.map((shipment) => {
            if (shipment.id !== id) return shipment;
            found = { ...shipment, ...patch, updatedAt: new Date().toISOString() };
            return found;
          });
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch {}
          if (found) syncToServer(found);
          return updated;
        });
      },
      removeShipment: (id) => {
        const deletedIds = loadDeletedIds();
        deletedIds.add(id);
        saveDeletedIds(deletedIds);
        setShipments((current) => {
          const next = current.filter((shipment) => shipment.id !== id);
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
        void deleteFromServer(id).catch(() => {
          // best-effort delete — server-side cleanup will handle orphans
        });
      },
      getShipment: (id) => shipments.find((shipment) => shipment.id === id),
      clear: () => {
        const deletedIds = loadDeletedIds();
        shipments.forEach((shipment) => deletedIds.add(shipment.id));
        saveDeletedIds(deletedIds);
        persist([]);
      }
    };
  }, [shipments, ready, persist]);

  return createElement(ShipmentsContext.Provider, { value }, children);
}

export function useShipments() {
  const context = useContext(ShipmentsContext);
  if (!context) {
    throw new Error("useShipments must be used inside ShipmentsProvider");
  }
  return context;
}

export function generateShipmentId(workflow: WorkflowKey) {
  const prefix = workflow === "importer" ? "IMP" : "EXP";
  const suffix = Date.now().toString().slice(-6);
  return `SS-${prefix}-${suffix}`;
}

export function generateInviteToken() {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${random}`;
}
