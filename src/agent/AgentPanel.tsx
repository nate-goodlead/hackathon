import { useEffect, useRef, useState } from "react";
import type { ForecastModel, ScenarioId } from "../types";
import { useAgent } from "./useAgent";

const SUGGESTIONS = [
  "What's the biggest cash risk this week?",
  "Switch to the severe scenario",
  "Draft a message to crews about weather delays",
  "Which projects need attention most?",
];

export function AgentPanel({
  model,
  onSetScenario,
  onRefreshWeather,
}: {
  model: ForecastModel;
  onSetScenario: (s: ScenarioId) => void;
  onRefreshWeather: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages, isLoading, sendMessage, clearMessages } = useAgent(
    model,
    onSetScenario,
    onRefreshWeather,
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage(text);
  }

  function pickSuggestion(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  return (
    <>
      {open && (
        <div className="ai-panel" role="dialog" aria-label="RoofFlow AI agent">
          <div className="ai-panel-header">
            <div>
              <strong>RoofFlow AI</strong>
              <span>Weather cash analyst</span>
            </div>
            <div className="ai-panel-header-actions">
              {messages.length > 0 && (
                <button onClick={clearMessages} title="Clear chat">
                  Clear
                </button>
              )}
              <button onClick={() => setOpen(false)} title="Close" aria-label="Close AI panel">
                ✕
              </button>
            </div>
          </div>

          <div className="ai-messages">
            {messages.length === 0 && (
              <div className="ai-welcome">
                <p>
                  Ask me about your portfolio, weather risk, or cash flow. I can
                  switch scenarios, refresh live weather, and draft
                  communications.
                </p>
                <div className="ai-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => pickSuggestion(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`ai-message ${msg.role}`}>
                {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <div className="ai-tool-trail">
                    {msg.toolsUsed.map((t, j) => (
                      <span key={j}>{t.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                )}
                <div className="ai-bubble">{msg.content}</div>
              </div>
            ))}

            {isLoading && (
              <div className="ai-message assistant">
                <div className="ai-bubble ai-thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="ai-input-row" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about weather risk, scenarios, cash flow…"
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      <button
        className={`ai-bubble-btn${open ? " active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close AI agent" : "Open AI agent"}
        title="RoofFlow AI"
      >
        {open ? "✕" : "AI"}
      </button>
    </>
  );
}
