import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertChannel } from "@prisma/client";

// El correo no sale de verdad: se captura lo que se habria enviado.
const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string; text: string; html: string }> }));
vi.mock("../src/config/mailer", () => ({
  isMailConfigured: () => true,
  sendMail: async (message: { to: string; subject: string; text: string; html: string }) => {
    mail.sent.push(message);
  },
}));

import { sendEmail } from "../src/alerts/notifiers/email";
import type { AlertPayload } from "../src/alerts/types";
import { buildInvitationEmail } from "../src/services/passwordResetService";
import { renderEmail } from "../src/utils/emailTemplate";

const LINK = "https://mclog.test/reset-password?token=abc&invite=1";

beforeEach(() => {
  mail.sent.length = 0;
});

describe("plantilla de correo", () => {
  it("escapa en el HTML lo que viene del usuario, y el texto plano lo conserva tal cual", () => {
    const { html, text } = renderEmail({
      locale: "es",
      preview: "Vista <previa>",
      heading: `Espacio <script>alert("x")</script>`,
      paragraphs: [`Nombre con "comillas" & 'apóstrofos'`],
      action: { label: "Entrar", url: `https://mclog.test/?a="><img src=x>` },
      reason: "Motivo",
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("Espacio &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Nombre con &quot;comillas&quot; &amp; &#39;apóstrofos&#39;");
    expect(text).toContain(`Espacio <script>alert("x")</script>`);
  });

  it("lleva el enlace en el botón, en el enlace de respaldo y en el texto plano", () => {
    const { html, text } = renderEmail({
      locale: "en",
      preview: "Preview",
      heading: "Heading",
      paragraphs: ["Body"],
      action: { label: "Open", url: LINK },
      notes: ["Expires soon"],
      reason: "Why",
    });

    const escapedLink = LINK.replace(/&/g, "&amp;");
    expect(html.split(`href="${escapedLink}"`)).toHaveLength(3);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("If the button doesn&#39;t work");
    expect(text).toContain(`Open:\n${LINK}`);
    expect(text).toContain("Expires soon");
  });
});

describe("caducidad de la invitación", () => {
  it.each([
    ["es", 1, "caduca en 1 día y"],
    ["es", 7, "caduca en 7 días y"],
    ["en", 1, "expires in 1 day and"],
    ["en", 7, "expires in 7 days and"],
  ] as const)("%s con %i: «%s»", (locale, days, expected) => {
    const email = buildInvitationEmail("Equipo", days, LINK, locale);
    expect(email.text).toContain(expected);
    expect(email.html).toContain(expected);
  });
});

describe("correo de alerta", () => {
  const channel = { id: 1, name: "correo", type: "email", config: { to: ["ana@example.com", "luis@example.com"] } } as unknown as AlertChannel;
  const payload = (overrides: Partial<AlertPayload>): AlertPayload => ({
    rule: { id: 1, name: "Errores <checkout>", type: "threshold" },
    triggeredAt: "2026-09-28T22:00:00.000Z",
    count: 42,
    windowMinutes: 5,
    threshold: 10,
    application: "mcsupport",
    environment: "production",
    level: "error",
    samples: [
      { id: 1, timestamp: "2026-09-28T22:04:30.000Z", application: "mcsupport", service: "api", level: "error", message: "Connection timeout", errorName: "Error" },
    ],
    dashboardUrl: "https://mclog.test/logs?rule=1",
    ...overrides,
  });

  it("resume la regla, lista los datos y las muestras, y enlaza al dashboard", async () => {
    await sendEmail(channel, payload({}));

    const [message] = mail.sent;
    expect(message.to).toBe("ana@example.com, luis@example.com");
    expect(message.text).toContain("ha registrado 42 coincidencias en los últimos 5 minutos (umbral: 10)");
    expect(message.text).toContain("Aplicación: mcsupport");
    expect(message.text).toContain("22:04:30 · mcsupport/api · Error: Connection timeout");
    expect(message.html).toContain("Errores &lt;checkout&gt;");
    expect(message.html).toContain('href="https://mclog.test/logs?rule=1"');
  });

  it("habla en singular de un solo error nuevo, sin umbral", async () => {
    await sendEmail(channel, payload({ rule: { id: 2, name: "Nuevos", type: "new_error_group" }, count: 1 }));
    expect(mail.sent[0].text).toContain("La regla «Nuevos» ha detectado un error nuevo en los últimos 5 minutos.");
  });

  it("sin URL pública no pone botón", async () => {
    await sendEmail(channel, payload({ dashboardUrl: null }));
    expect(mail.sent[0].html).not.toContain("<a href");
  });
});
