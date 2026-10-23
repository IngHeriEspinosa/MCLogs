import { describe, expect, it } from "vitest";
import { buildWebhookBody, detectWebhookFormat } from "../src/alerts/notifiers/webhook";
import type { AlertPayload } from "../src/alerts/types";

const payload: AlertPayload = {
  rule: { id: 1, name: "errores de facturacion", type: "threshold" },
  triggeredAt: "2026-10-01T10:00:00.000Z",
  count: 4,
  windowMinutes: 10,
  threshold: 3,
  application: "facturacion",
  environment: "production",
  level: "error",
  samples: [
    {
      id: 9,
      timestamp: "2026-10-01T09:59:00.000Z",
      application: "facturacion",
      service: "pagos",
      level: "error",
      message: "Timeout <pasarela> & `reintento`",
      errorName: "TimeoutError",
      fingerprint: "abc",
      traceId: null,
    },
  ],
  dashboardUrl: "https://panel.example.com/logs?ws=1",
};

describe("Formato del webhook", () => {
  it("deduce el formato de la URL", () => {
    expect(detectWebhookFormat("https://hooks.slack.com/services/T/B/x")).toBe("slack");
    expect(detectWebhookFormat("https://discord.com/api/webhooks/1/abc")).toBe("discord");
    expect(detectWebhookFormat("https://contoso.webhook.office.com/webhookb2/x")).toBe("teams");
    expect(detectWebhookFormat("https://prod-01.westus.logic.azure.com/workflows/x")).toBe("teams");
    expect(detectWebhookFormat("https://n8n.example.com/webhook/mclog")).toBe("generic");
    expect(detectWebhookFormat("no es una url")).toBe("generic");
    // Discord solo en su ruta de webhooks.
    expect(detectWebhookFormat("https://discord.com/channels/1")).toBe("generic");
  });

  it("Slack recibe text y bloques, con los caracteres reservados escapados", () => {
    const body = buildWebhookBody("slack", payload) as { text: string; blocks: Array<Record<string, unknown>> };
    expect(body.text).toBe("[MCLog] errores de facturacion: 4 en 10 min");
    const serialized = JSON.stringify(body.blocks);
    expect(serialized).toContain("&lt;pasarela&gt; &amp;");
    expect(serialized).not.toContain("`reintento`");
    expect(body.blocks.at(-1)).toMatchObject({ type: "actions" });
  });

  it("Discord recibe content y un embed enlazado", () => {
    const body = buildWebhookBody("discord", payload) as { content: string; embeds: Array<Record<string, unknown>> };
    expect(body.content).toBe("[MCLog] errores de facturacion: 4 en 10 min");
    expect(body.embeds[0]).toMatchObject({ title: "errores de facturacion", url: payload.dashboardUrl, color: 0xd93025 });
  });

  it("Teams recibe una tarjeta adaptable con el enlace como accion", () => {
    const body = buildWebhookBody("teams", payload) as { type: string; attachments: Array<{ contentType: string; content: Record<string, unknown> }> };
    expect(body.type).toBe("message");
    expect(body.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(body.attachments[0].content).toMatchObject({
      type: "AdaptiveCard",
      actions: [{ type: "Action.OpenUrl", url: payload.dashboardUrl }],
    });
  });

  it("el generico es el aviso tal cual, con su titulo", () => {
    expect(buildWebhookBody("generic", payload)).toEqual({ title: "[MCLog] errores de facturacion: 4 en 10 min", ...payload });
  });
});
