import { getCompletedStepKeys, actionKey } from "@/lib/endorsement-flow";
import type { DemoEndorsementRecord } from "@/lib/endorsement-flow";

export type ChatActorRole = "exporter" | "freight_forwarder" | "importer";
export type AccessLevel = "full" | "locked";

export interface LockInfo {
  reason: string;
  unlocksWhen: string;
}

/**
 * Derived access state computed once after the lock check passes.
 * Downstream redaction functions consume this instead of re-querying endorsements.
 */
export type AccessState = {
  role: ChatActorRole;
  completedSteps: Set<string>;
  /** FF: after picked_up; Importer: after cleared_customs; Exporter: always */
  canSeeExporterDocs: boolean;
  /** FF: always; Importer: after handed_off; Exporter: always */
  canSeeFFDocs: boolean;
  /** FF: after reviewed; Importer: always; Exporter: always */
  canSeeImporterDocs: boolean;
  /** Normalized party namespace key (e.g. "acme-robotics-llc") for cross-namespace MemWal detection */
  actorNamespaceKey?: string;
  /** Company name used for search_similar_shipments party scoping */
  actorCompany?: string;
};

export interface AccessResult {
  level: AccessLevel;
  lockInfo?: LockInfo;
  /** Present when level === 'full'. Used by redaction engine. */
  accessState?: AccessState;
}

/** Normalize MockRole ("Freight Forwarder") → snake_case ("freight_forwarder"). */
export function normalizeRole(raw: string | null | undefined): ChatActorRole | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "exporter") return "exporter";
  if (trimmed === "importer") return "importer";
  if (trimmed === "freight forwarder" || trimmed === "freight_forwarder") return "freight_forwarder";
  return null;
}

/**
 * Determine chat access level for the given role + current endorsement state.
 * When level === 'full', accessState is populated with derived booleans for
 * downstream redaction decisions.
 *
 * Access table:
 *   Exporter        → always full
 *   Freight Forwarder → full after any FF endorsement (picked_up = step 1)
 *   Importer        → full after freight_forwarder:cleared_customs (step 4)
 *   null / unknown  → locked
 */
export function getChatAccessLevel(
  role: ChatActorRole | null,
  endorsements: DemoEndorsementRecord[],
  actorParty?: { company?: string; namespaceKey?: string }
): AccessResult {
  const completed = getCompletedStepKeys(endorsements);

  function buildAccessState(r: ChatActorRole): AccessState {
    const hasPickedUp = completed.has(actionKey("freight_forwarder", "picked_up"));
    const hasHandedOff = completed.has(actionKey("freight_forwarder", "handed_off"));
    const hasReviewed = completed.has(actionKey("freight_forwarder", "reviewed"));
    const hasClearedCustoms = completed.has(actionKey("freight_forwarder", "cleared_customs"));

    return {
      role: r,
      completedSteps: completed,
      canSeeExporterDocs:
        r === "exporter" ? true
        : r === "freight_forwarder" ? hasPickedUp
        : hasClearedCustoms,
      canSeeFFDocs:
        r === "freight_forwarder" || r === "exporter" ? true
        : hasHandedOff,
      canSeeImporterDocs:
        r === "importer" || r === "exporter" ? true
        : hasReviewed,
      actorCompany: actorParty?.company,
      actorNamespaceKey: actorParty?.namespaceKey,
    };
  }

  if (role === "exporter") {
    return { level: "full", accessState: buildAccessState("exporter") };
  }

  if (role === "freight_forwarder") {
    const hasAnyFFEndorsement =
      completed.has(actionKey("freight_forwarder", "picked_up")) ||
      completed.has(actionKey("freight_forwarder", "handed_off")) ||
      completed.has(actionKey("freight_forwarder", "reviewed")) ||
      completed.has(actionKey("freight_forwarder", "cleared_customs"));

    if (hasAnyFFEndorsement) {
      return { level: "full", accessState: buildAccessState("freight_forwarder") };
    }

    return {
      level: "locked",
      lockInfo: {
        reason: "Freight Forwarder chat is not yet available for this shipment.",
        unlocksWhen: "Sign the 'Picked Up' endorsement to unlock operational access.",
      },
    };
  }

  if (role === "importer") {
    const customsCleared = completed.has(actionKey("freight_forwarder", "cleared_customs"));

    if (customsCleared) {
      return { level: "full", accessState: buildAccessState("importer") };
    }

    return {
      level: "locked",
      lockInfo: {
        reason: "Importer chat is not yet available for this shipment.",
        unlocksWhen:
          "Chat unlocks after the freight forwarder completes customs clearance (step 4 of 4).",
      },
    };
  }

  return {
    level: "locked",
    lockInfo: {
      reason: "Chat access is not available.",
      unlocksWhen: "Select a valid role (Exporter, Freight Forwarder, or Importer).",
    },
  };
}
