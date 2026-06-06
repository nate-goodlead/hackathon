import { useCallback, useRef, useState } from "react";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { ForecastModel, ScenarioId } from "../types";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "./tools";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
}

const SYSTEM_PROMPT = `You are the RoofFlow Radar AI agent — a weather-aware cash-flow analyst embedded in a roofing acquisition portfolio dashboard.

Your job is to help portfolio managers, CFOs, and project managers understand weather-driven cash risk and take mitigation actions.

Available capabilities via tools:
- Query live portfolio KPIs and forecast model (get_portfolio_summary, get_project_details)
- Switch forecast scenarios: base, wet, dry (set_scenario)
- Trigger live weather refresh from Open-Meteo (refresh_weather)
- Draft professional communications for crews, clients, CFOs, and PMs (draft_communication)

Behaviour rules:
- Be concise and data-driven. Reference specific € amounts, %, and week numbers.
- Always call get_portfolio_summary before answering general questions about the portfolio.
- Call get_project_details when asked about a specific city or project.
- When asked to draft a message, call draft_communication first, then write the actual message in your reply.
- You see aggregated risk outputs, not raw contract data (privacy-safe context).
- Never claim to have executed an action autonomously — every recommendation requires human approval.`;

export function useAgent(
  model: ForecastModel,
  onSetScenario: (s: ScenarioId) => void,
  onRefreshWeather: () => Promise<void>,
) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const clientRef = useRef<Anthropic | null>(null);

  function getClient(): Anthropic {
    if (!clientRef.current) {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
      if (!apiKey) {
        throw new Error(
          "VITE_ANTHROPIC_API_KEY is not set. Create a .env file with VITE_ANTHROPIC_API_KEY=your_key.",
        );
      }
      clientRef.current = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
      });
    }
    return clientRef.current;
  }

  const sendMessage = useCallback(
    async (userText: string) => {
      const userMsg: AgentMessage = { role: "user", content: userText };
      const history = [...messages, userMsg];
      setMessages(history);
      setIsLoading(true);

      const ctx: ToolContext = { model, onSetScenario, onRefreshWeather };

      try {
        const client = getClient();
        let apiMessages: MessageParam[] = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        let finalText = "";
        const toolsUsed: string[] = [];

        // Agentic loop — run until the model stops requesting tool calls
        while (true) {
          const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: TOOL_DEFINITIONS,
            messages: apiMessages,
          });

          if (response.stop_reason === "tool_use") {
            const toolResultContents = response.content
              .filter((b) => b.type === "tool_use")
              .map((b) => {
                if (b.type !== "tool_use") return null!;
                toolsUsed.push(b.name);
                const result = executeTool(
                  b.name,
                  b.input as Record<string, unknown>,
                  ctx,
                );
                return {
                  type: "tool_result" as const,
                  tool_use_id: b.id,
                  content: result,
                };
              });

            apiMessages = [
              ...apiMessages,
              { role: "assistant", content: response.content },
              { role: "user", content: toolResultContents },
            ];
          } else {
            for (const block of response.content) {
              if (block.type === "text") finalText += block.text;
            }
            break;
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: finalText,
            toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              err instanceof Error
                ? `Error: ${err.message}`
                : "An unknown error occurred.",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, model, onSetScenario, onRefreshWeather],
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, sendMessage, clearMessages };
}
