import { isMemWalConfigured, memwalHealth, memwalRecall, memwalRemember } from "@/lib/memwal/client";

export type DummyMemWalAgentInput = {
  shipmentId?: string;
  message?: string;
  query?: string;
};

export type DummyMemWalAgentResult =
  | {
      ok: true;
      configured: true;
      namespace: string;
      remembered: {
        jobId: string;
        blobId: string;
      };
      recalled: Array<{
        blobId: string;
        text: string;
        distance: number;
      }>;
    }
  | {
      ok: false;
      configured: false;
      namespace: string;
      error: string;
      requiredEnv: string[];
    };

export function dummyAgentNamespace(shipmentId = "demo-shipment"): string {
  return `${shipmentId}:dummy-agent`;
}

export async function runDummyMemWalAgent(
  input: DummyMemWalAgentInput = {}
): Promise<DummyMemWalAgentResult> {
  const namespace = dummyAgentNamespace(input.shipmentId);

  if (!isMemWalConfigured()) {
    return {
      ok: false,
      configured: false,
      namespace,
      error: "MemWal is not configured. Set real MEMWAL_ED25519_KEY and MEMWAL_ACCOUNT_ID values.",
      requiredEnv: ["MEMWAL_ED25519_KEY", "MEMWAL_ACCOUNT_ID", "MEMWAL_SERVER_URL"],
    };
  }

  const healthy = await memwalHealth();
  if (!healthy) {
    throw new Error("MemWal health check failed");
  }

  const now = new Date().toISOString();
  const message =
    input.message ??
    "Dummy SuiShip agent memory: Straits of Hormuz disruption may delay the shipment. Recommend contacting carrier and notifying consignee.";
  const query = input.query ?? "shipment delay route disruption carrier recommendation";
  const memory = [
    "SUISHIP DUMMY AGENT MEMORY",
    `created_at: ${now}`,
    `shipment_id: ${input.shipmentId ?? "demo-shipment"}`,
    `message: ${message}`,
  ].join("\n");

  const remembered = await memwalRemember(memory, namespace);
  const recalled = await memwalRecall(query, namespace, 3);

  return {
    ok: true,
    configured: true,
    namespace,
    remembered: {
      jobId: remembered.jobId,
      blobId: remembered.blobId,
    },
    recalled,
  };
}

