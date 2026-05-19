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
  try {
    await fetch(`/api/shipments/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // non-fatal
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
};

export type PartyInfo = {
  company: string;
  contact: string;
  email: string;
  phone: string;
  taxId?: string;
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

export type ShipmentRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: WorkflowKey;
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
  walrusManifestBlobId?: string;
  walrusBlobIds?: string[];
  manifestHash?: string;
  mintedAt?: string;
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

const ShipmentsContext = createContext<ShipmentsContextValue | null>(null);

export function ShipmentsProvider({ children }: { children: React.ReactNode }) {
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let local: ShipmentRecord[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ShipmentRecord[];
        if (Array.isArray(parsed)) local = parsed;
      }
    } catch {}

    fetch("/api/shipments")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((server: ShipmentRecord[]) => {
        const serverIds = new Set(server.map((r) => r.id));
        const merged = [...server, ...local.filter((r) => !serverIds.has(r.id))];
        setShipments(merged);
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
      })
      .catch(() => {
        setShipments(local);
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
        persist([record, ...shipments.filter((existing) => existing.id !== record.id)]);
        syncToServer(record);
      },
      updateShipment: (id, patch) => {
        const updated = shipments.map((shipment) =>
          shipment.id === id
            ? { ...shipment, ...patch, updatedAt: new Date().toISOString() }
            : shipment
        );
        persist(updated);
        const found = updated.find((s) => s.id === id);
        if (found) syncToServer(found);
      },
      removeShipment: (id) => {
        persist(shipments.filter((shipment) => shipment.id !== id));
        deleteFromServer(id);
      },
      getShipment: (id) => shipments.find((shipment) => shipment.id === id),
      clear: () => persist([])
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
