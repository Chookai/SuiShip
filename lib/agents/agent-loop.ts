import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";

const logger = pino({ name: "agent-loop" });

export type AgentToolExecutor = (input: unknown) => Promise<unknown>;

export type AgentLoopOptions<T> = {
  client: Anthropic;
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  toolExecutors: Record<string, AgentToolExecutor>;
  maxToolCalls?: number;
  timeoutMs?: number;
  extractFinal: (messages: Anthropic.MessageParam[], toolEvents: ToolEvent[]) => T;
};

export type ToolEvent = {
  name: string;
  input: unknown;
  result: unknown;
};

export async function runAgentLoop<T>(options: AgentLoopOptions<T>): Promise<T> {
  const maxToolCalls = options.maxToolCalls ?? 8;
  const deadline = Date.now() + (options.timeoutMs ?? 20_000);
  const messages = [...options.messages];
  const toolEvents: ToolEvent[] = [];
  let toolCallCount = 0;

  while (Date.now() < deadline) {
    const response = await options.client.messages.create({
      model: options.model,
      max_tokens: 1600,
      system: options.system,
      messages,
      tools: options.tools,
    });

    messages.push({ role: "assistant", content: response.content });
    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      return options.extractFinal(messages, toolEvents);
    }

    if (toolCallCount + toolUses.length > maxToolCalls) {
      logger.warn({ toolCallCount, requested: toolUses.length, maxToolCalls }, "Agent loop hit tool cap");
      break;
    }
    toolCallCount += toolUses.length;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const executor = options.toolExecutors[toolUse.name];
      let result: unknown;
      try {
        result = executor
          ? await executor(toolUse.input)
          : { error: `No executor registered for ${toolUse.name}` };
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      toolEvents.push({ name: toolUse.name, input: toolUse.input, result });
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
    if (toolEvents.some((event) => event.name === "done")) {
      return options.extractFinal(messages, toolEvents);
    }
  }

  return options.extractFinal(messages, toolEvents);
}
