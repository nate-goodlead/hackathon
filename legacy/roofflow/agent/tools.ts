import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { ForecastModel, ScenarioId } from "../types";

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "get_portfolio_summary",
    description:
      "Get the current portfolio KPIs, active scenario, and top risk projects. Call this before answering general portfolio questions.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_project_details",
    description:
      "Get full risk details for a specific project by ID, name, or city.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Project ID, project name, or city name",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "set_scenario",
    description:
      "Switch the active forecast scenario on the dashboard. Options: base, wet, dry.",
    input_schema: {
      type: "object" as const,
      properties: {
        scenario: {
          type: "string",
          enum: ["base", "wet", "dry"],
          description: "The scenario to activate",
        },
      },
      required: ["scenario"],
    },
  },
  {
    name: "refresh_weather",
    description:
      "Trigger a live weather data refresh from Open-Meteo for all active project cities.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "draft_communication",
    description:
      "Get the portfolio context needed to draft a professional communication. After calling this, write the actual message in your response.",
    input_schema: {
      type: "object" as const,
      properties: {
        audience: {
          type: "string",
          enum: ["crews", "client", "cfo", "pm"],
          description: "Who the message is for",
        },
        focus: {
          type: "string",
          description:
            "What to focus on, e.g. 'weather delay on Rotterdam project' or 'cash buffer request'",
        },
      },
      required: ["audience", "focus"],
    },
  },
];

export interface ToolContext {
  model: ForecastModel;
  onSetScenario: (scenario: ScenarioId) => void;
  onRefreshWeather: () => Promise<void>;
}

export function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): string {
  switch (name) {
    case "get_portfolio_summary": {
      const { summary, scenario, risks } = ctx.model;
      const top = risks.slice(0, 5).map((r) => ({
        project: `${r.project.city} — ${r.project.name}`,
        risk: r.riskLevel,
        exposureEur: r.totalExposure,
        delayDays: r.delayDays,
      }));
      return JSON.stringify({
        scenario,
        cashAtRiskEur: summary.cashAtRisk,
        idleCostEur: summary.idleCost,
        bufferNeededEur: summary.bufferNeeded,
        criticalProjects: summary.criticalProjects,
        totalProjects: risks.length,
        averageWorkabilityPct: summary.averageWorkability,
        worstWeek: summary.worstWeek,
        topRiskProjects: top,
      });
    }

    case "get_project_details": {
      const q = String(input.query).toLowerCase();
      const risk = ctx.model.risks.find(
        (r) =>
          r.project.id.toLowerCase().includes(q) ||
          r.project.name.toLowerCase().includes(q) ||
          r.project.city.toLowerCase().includes(q),
      );
      if (!risk)
        return JSON.stringify({
          error:
            "Project not found. Call get_portfolio_summary to see available project cities.",
        });
      return JSON.stringify({
        id: risk.project.id,
        name: risk.project.name,
        city: risk.project.city,
        company: risk.company.name,
        phase: risk.project.phase,
        riskLevel: risk.riskLevel,
        delayDays: risk.delayDays,
        cashAtRiskEur: risk.cashAtRisk,
        idleCostEur: risk.idleCost,
        totalExposureEur: risk.totalExposure,
        worstWeek: risk.worstWeek.week,
        worstWeekWorkabilityPct: risk.worstWeek.workabilityScore,
        worstWeekReasons: risk.worstWeek.reasons,
        recommendation: risk.recommendation,
      });
    }

    case "set_scenario": {
      const scenario = input.scenario as ScenarioId;
      ctx.onSetScenario(scenario);
      return JSON.stringify({
        success: true,
        scenario,
        message: `Dashboard switched to "${scenario}" scenario.`,
      });
    }

    case "refresh_weather": {
      ctx.onRefreshWeather().catch(console.error);
      return JSON.stringify({
        success: true,
        message:
          "Live weather refresh started. Check the status bar in the dashboard for progress.",
      });
    }

    case "draft_communication": {
      const audience = String(input.audience);
      const focus = String(input.focus);
      const { summary, risks } = ctx.model;
      const top = risks[0];
      return JSON.stringify({
        audience,
        focus,
        portfolioContext: {
          scenario: ctx.model.scenario,
          cashAtRiskEur: summary.cashAtRisk,
          idleCostEur: summary.idleCost,
          worstWeek: summary.worstWeek,
          topRiskProject: top
            ? `${top.project.city} — ${top.project.name}`
            : null,
          topRiskRecommendation: top?.recommendation ?? null,
        },
        instruction: `Write a concise, professional message for ${audience} focused on: ${focus}. Use the portfolioContext above for specific numbers.`,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
