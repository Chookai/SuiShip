/** Roles that actively sign in the custody flow (exporter omitted; customs handled by FF). */
export type DemoEndorsementRole = "freight_forwarder" | "importer";

/** Legacy on-chain roles still readable from older shipments. */
export type LegacyEndorsementRole = "exporter" | "customs";

export type DemoEndorsementAction =
  | "picked_up"
  | "handed_off"
  | "reviewed"
  | "cleared_customs"
  | "received";

export type DemoEndorsementRecord = {
  role: string;
  action: string;
  signer_address?: string;
  signer?: string;
  signed_at_ms?: number;
  tx_digest?: string;
};

export type DemoEndorsementStep = {
  role: DemoEndorsementRole;
  action: DemoEndorsementAction;
  label: string;
};

/** FF handles logistics + customs checkpoints; importer signs receipt only. */
export const DEMO_ENDORSEMENT_FLOW: DemoEndorsementStep[] = [
  { role: "freight_forwarder", action: "picked_up", label: "Freight forwarder picks up cargo" },
  { role: "freight_forwarder", action: "handed_off", label: "Freight forwarder hands off cargo" },
  { role: "freight_forwarder", action: "reviewed", label: "Freight forwarder completes customs review" },
  { role: "freight_forwarder", action: "cleared_customs", label: "Freight forwarder confirms customs clearance" },
  { role: "importer", action: "received", label: "Importer receives shipment" },
];

export const ENDORSEMENT_STEP_LABELS: Record<DemoEndorsementAction, string> = {
  picked_up: "Picked Up",
  handed_off: "Handed Off",
  reviewed: "Customs Reviewed",
  cleared_customs: "Customs Cleared",
  received: "Received",
};

export const ENDORSEMENT_ROLE_LABELS: Record<DemoEndorsementRole, string> = {
  freight_forwarder: "Freight Forwarder",
  importer: "Importer",
};

export function formatEndorsementActivityLabel(
  action: string,
  importerCompany?: string | null,
): string {
  switch (action) {
    case "picked_up":
      return "Picked up by Freight Forwarder";
    case "handed_off":
      return "Handed Off by Freight Forwarder";
    case "reviewed":
      return "Customs Reviewed";
    case "cleared_customs":
      return "Customs Cleared";
    case "received": {
      const name = importerCompany?.trim();
      return name ? `Received by ${name}` : "Received by Importer";
    }
    default:
      return action.replace(/_/g, " ");
  }
}

/** @deprecated Use formatEndorsementActivityLabel for activity log copy. */
export function formatEndorsementSummary(_role: string, action: string): string {
  return formatEndorsementActivityLabel(action);
}

export const ROLE_ACTIONS: Record<DemoEndorsementRole, DemoEndorsementAction[]> = {
  freight_forwarder: ["picked_up", "handed_off", "reviewed", "cleared_customs"],
  importer: ["received"],
};

export const ACTIVE_ENDORSEMENT_ROLES: DemoEndorsementRole[] = ["freight_forwarder", "importer"];

function signerOf(record: DemoEndorsementRecord): string {
  return (record.signer_address ?? record.signer ?? "").toLowerCase();
}

export function actionKey(role: string, action: string): string {
  return `${role}:${action}`;
}

export function getCompletedStepKeys(endorsements: DemoEndorsementRecord[]): Set<string> {
  return new Set(endorsements.map((endorsement) => actionKey(endorsement.role, endorsement.action)));
}

export function getNextRequiredStep(endorsements: DemoEndorsementRecord[]): DemoEndorsementStep | null {
  const completed = getCompletedStepKeys(endorsements);
  return DEMO_ENDORSEMENT_FLOW.find((step) => !completed.has(actionKey(step.role, step.action))) ?? null;
}

export function getRoleActionsForUi(
  role: DemoEndorsementRole,
  endorsements: DemoEndorsementRecord[],
): Array<{
  action: DemoEndorsementAction;
  enabled: boolean;
  completed: boolean;
  blockedReason?: string;
}> {
  const completed = getCompletedStepKeys(endorsements);
  const nextStep = getNextRequiredStep(endorsements);

  return ROLE_ACTIONS[role].map((action) => {
    const key = actionKey(role, action);
    const alreadyCompleted = completed.has(key);
    if (alreadyCompleted) {
      return { action, enabled: false, completed: true, blockedReason: "Already completed" };
    }
    if (!nextStep) {
      return { action, enabled: false, completed: false, blockedReason: "Custody flow already complete" };
    }
    if (nextStep.role !== role || nextStep.action !== action) {
      return {
        action,
        enabled: false,
        completed: false,
        blockedReason: `Waiting for ${nextStep.role.replace(/_/g, " ")} → ${nextStep.action.replace(/_/g, " ")}`,
      };
    }
    return { action, enabled: true, completed: false };
  });
}

export function validateDemoEndorsementAttempt(input: {
  role: string;
  action: string;
  endorsements: DemoEndorsementRecord[];
  signerAddress: string;
  importerAddress?: string | null;
  exporterAddress?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const { role, action, endorsements, signerAddress, importerAddress } = input;
  const nextStep = getNextRequiredStep(endorsements);
  const normalizedSigner = signerAddress.toLowerCase();

  if (!(role in ROLE_ACTIONS)) {
    return { ok: false, error: `Unsupported role: ${role}` };
  }
  const roleActions = ROLE_ACTIONS[role as DemoEndorsementRole] as string[];
  if (!roleActions.includes(action)) {
    return { ok: false, error: `Unsupported action "${action}" for role "${role}"` };
  }
  if (getCompletedStepKeys(endorsements).has(actionKey(role, action))) {
    return {
      ok: false,
      error: `${role.replace(/_/g, " ")} already recorded "${action.replace(/_/g, " ")}" for this shipment.`,
    };
  }
  if (!nextStep) {
    return { ok: false, error: "The custody flow is already complete for this shipment." };
  }
  if (nextStep.role !== role || nextStep.action !== action) {
    return {
      ok: false,
      error: `Next required step is ${nextStep.role.replace(/_/g, " ")} → ${nextStep.action.replace(/_/g, " ")}.`,
    };
  }

  if (role === "importer" && importerAddress && normalizedSigner !== importerAddress.toLowerCase()) {
    return { ok: false, error: "Importer endorsements must be signed by the importer address for this shipment." };
  }

  return { ok: true };
}

export function buildTxDigestMap(endorsements: DemoEndorsementRecord[]): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const endorsement of endorsements) {
    const txDigest = endorsement.tx_digest;
    if (!txDigest) continue;
    const signer = signerOf(endorsement);
    const key = `${endorsement.role}:${signer}:${endorsement.action}`;
    const list = grouped.get(key) ?? [];
    list.push(txDigest);
    grouped.set(key, list);
  }
  const flattened = new Map<string, string>();
  for (const [key, digests] of grouped.entries()) {
    if (digests.length > 0) flattened.set(key, digests[0]);
  }
  return flattened;
}
