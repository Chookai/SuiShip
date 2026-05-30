// Modeled on lib/agent-runs.ts and lib/artifacts.ts
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";

export type ChatRole = "user" | "assistant" | "tool_call" | "tool_result";

export type ChatMessage = {
  id: string;
  shipmentId: string;
  role: ChatRole;
  content: string;
  toolName?: string | null;
  toolInputJson?: string | null;
  toolResultJson?: string | null;
  isError: boolean;
  agentRunId?: string | null;
  createdAt: string;
};

type ChatRow = {
  id: string;
  shipment_id: string;
  role: ChatRole;
  content: string;
  tool_name: string | null;
  tool_input_json: string | null;
  tool_result_json: string | null;
  is_error: number;
  agent_run_id: string | null;
  created_at: string;
};

function rowToMessage(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    role: row.role,
    content: row.content,
    toolName: row.tool_name,
    toolInputJson: row.tool_input_json,
    toolResultJson: row.tool_result_json,
    isError: row.is_error === 1,
    agentRunId: row.agent_run_id,
    createdAt: row.created_at,
  };
}

export function createChatAgentRun(
  shipmentId: string,
  db: Database.Database = getDb()
): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO agent_runs (id, shipment_id, run_type, status, current_step)
    VALUES (?, ?, 'chat_agent', 'created', 'Chat agent session started')
  `).run(id, shipmentId);
  return id;
}

export function insertChatMessage(
  input: {
    shipmentId: string;
    role: ChatRole;
    content?: string;
    toolName?: string | null;
    toolInputJson?: string | null;
    toolResultJson?: string | null;
    isError?: boolean;
    agentRunId?: string | null;
  },
  db: Database.Database = getDb()
): ChatMessage {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO shipment_chats
      (id, shipment_id, role, content, tool_name, tool_input_json, tool_result_json, is_error, agent_run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.shipmentId,
    input.role,
    input.content ?? "",
    input.toolName ?? null,
    input.toolInputJson ?? null,
    input.toolResultJson ?? null,
    input.isError ? 1 : 0,
    input.agentRunId ?? null
  );
  return rowToMessage(
    db.prepare("SELECT * FROM shipment_chats WHERE id = ?").get(id) as ChatRow
  );
}

export function loadChatHistory(
  shipmentId: string,
  limit = 20,
  db: Database.Database = getDb()
): ChatMessage[] {
  const rows = db.prepare(`
    SELECT * FROM shipment_chats
    WHERE shipment_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(shipmentId, limit) as ChatRow[];
  return rows.map(rowToMessage);
}

export function clearChatHistory(
  shipmentId: string,
  db: Database.Database = getDb()
): void {
  db.prepare("DELETE FROM shipment_chats WHERE shipment_id = ?").run(shipmentId);
}
