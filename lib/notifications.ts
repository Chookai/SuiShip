"use client";

import { useEffect, useMemo, useState } from "react";
import type { MockRole } from "@/components/role-context";
import type { ShipmentRecord, WorkflowKey } from "./shipments-store";

export type ShipmentInvitation = {
  shipment: ShipmentRecord;
  unread: boolean;
};

const STORAGE_KEY = "suiship-seen-invites";

type SeenMap = Partial<Record<MockRole, string[]>>;

function loadSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSeen(map: SeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function roleToWorkflow(role: MockRole): WorkflowKey {
  return role === "Importer" ? "importer" : "exporter";
}

export function useInvitations(role: MockRole, shipments: ShipmentRecord[]) {
  const mySide = roleToWorkflow(role);
  const [seen, setSeen] = useState<SeenMap>({});

  useEffect(() => {
    setSeen(loadSeen());
  }, []);

  const invitations = useMemo<ShipmentInvitation[]>(() => {
    const seenForRole = new Set(seen[role] || []);
    return shipments
      .filter((shipment) => shipment.createdBy !== mySide)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((shipment) => ({ shipment, unread: !seenForRole.has(shipment.id) }));
  }, [shipments, mySide, role, seen]);

  const unreadCount = invitations.filter((item) => item.unread).length;

  function markRead(shipmentIds: string[]) {
    setSeen((current) => {
      const existing = new Set(current[role] || []);
      shipmentIds.forEach((id) => existing.add(id));
      const next: SeenMap = { ...current, [role]: Array.from(existing) };
      saveSeen(next);
      return next;
    });
  }

  function markAllRead() {
    markRead(invitations.map((item) => item.shipment.id));
  }

  return { invitations, unreadCount, markRead, markAllRead };
}
