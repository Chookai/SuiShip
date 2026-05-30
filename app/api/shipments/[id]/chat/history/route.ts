import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { clearChatHistory, loadChatHistory } from "@/lib/chat-tools/history";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();
    const messages = loadChatHistory(shipmentId, 40, db);

    // Group tool_call/tool_result rows onto their parent assistant message
    // for a cleaner display payload. user/assistant rows are returned as-is.
    type DisplayMessage = {
      id: string;
      role: "user" | "assistant";
      content: string;
      createdAt: string;
      toolCalls?: Array<{
        name: string;
        inputJson: string | null;
        resultJson: string | null;
        isError: boolean;
      }>;
    };

    const display: DisplayMessage[] = [];
    let pendingTools: DisplayMessage["toolCalls"] = [];

    for (const msg of messages) {
      if (msg.role === "tool_call") {
        pendingTools = pendingTools ?? [];
        pendingTools.push({
          name: msg.toolName ?? "unknown",
          inputJson: msg.toolInputJson ?? null,
          resultJson: null,
          isError: false,
        });
      } else if (msg.role === "tool_result") {
        const last = pendingTools?.[pendingTools.length - 1];
        if (last && last.name === (msg.toolName ?? "unknown")) {
          last.resultJson = msg.toolResultJson ?? null;
          last.isError = msg.isError;
        }
      } else if (msg.role === "assistant") {
        display.push({
          id: msg.id,
          role: "assistant",
          content: msg.content,
          createdAt: msg.createdAt,
          toolCalls: pendingTools && pendingTools.length > 0 ? pendingTools : undefined,
        });
        pendingTools = [];
      } else if (msg.role === "user") {
        pendingTools = [];
        display.push({
          id: msg.id,
          role: "user",
          content: msg.content,
          createdAt: msg.createdAt,
        });
      }
    }

    return NextResponse.json({ messages: display });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();
    clearChatHistory(shipmentId, db);
    return NextResponse.json({ cleared: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
