import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config/env";
import { createGraphMailSender } from "../src/config/graphMailer";
import { isMailConfigured, resetEmailTransport, sendMail } from "../src/config/mailer";

// Microsoft no se toca de verdad: fetch responde con lo que cada prueba ponga en cola.
const CREDENTIALS = { tenantId: "tenant-id", clientId: "client-id", clientSecret: "secreto-de-la-app" };
const TOKEN_URL = "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token";
const SEND_URL = "https://graph.microsoft.com/v1.0/users/no-reply%40mclog.test/sendMail";
const FROM = "MCLog <no-reply@mclog.test>";
const MESSAGE = {
  from: FROM,
  to: "ana@example.com, luis@example.com",
  subject: "Aviso de prueba",
  text: "Hola en texto",
  html: "<p>Hola en <b>HTML</b></p>",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokenReply = (accessToken: string) => json(200, { token_type: "Bearer", expires_in: 3599, access_token: accessToken });
const accepted = () => new Response(null, { status: 202 });

const replies: Record<string, Response[]> = {};
const calls: Array<{ url: string; init: RequestInit }> = [];
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  const reply = replies[url]?.shift();
  if (!reply) throw new Error(`Petición inesperada a ${url}`);
  return reply;
});

const callsTo = (url: string) => calls.filter((call) => call.url === url);
const headerOf = (init: RequestInit, name: string) => new Headers(init.headers).get(name);
const decodedMime = (init: RequestInit) => Buffer.from(String(init.body), "base64").toString("utf8");

beforeEach(() => {
  calls.length = 0;
  replies[TOKEN_URL] = [];
  replies[SEND_URL] = [];
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("envío por Microsoft Graph", () => {
  it("pide el token con client credentials y envía el MIME en base64 al buzón del remitente", async () => {
    replies[TOKEN_URL].push(tokenReply("token-1"));
    replies[SEND_URL].push(accepted());

    await createGraphMailSender(CREDENTIALS, 1000)(MESSAGE);

    const [tokenCall] = callsTo(TOKEN_URL);
    expect(tokenCall.init.method).toBe("POST");
    const form = new URLSearchParams(String(tokenCall.init.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "client_credentials",
      client_id: "client-id",
      client_secret: "secreto-de-la-app",
      scope: "https://graph.microsoft.com/.default",
    });

    const [sendCall] = callsTo(SEND_URL);
    expect(sendCall.init.method).toBe("POST");
    expect(headerOf(sendCall.init, "authorization")).toBe("Bearer token-1");
    expect(headerOf(sendCall.init, "content-type")).toBe("text/plain");
    const mime = decodedMime(sendCall.init);
    expect(mime).toContain(`From: ${FROM}`);
    expect(mime).toContain("To: ana@example.com, luis@example.com");
    expect(mime).toContain("Subject: Aviso de prueba");
    expect(mime).toContain("Content-Type: multipart/alternative");
    expect(mime).toContain("Hola en texto");
    expect(mime).toContain("<p>Hola en <b>HTML</b></p>");
  });

  it("reutiliza el token mientras no caduca", async () => {
    replies[TOKEN_URL].push(tokenReply("token-1"));
    replies[SEND_URL].push(accepted(), accepted());
    const send = createGraphMailSender(CREDENTIALS, 1000);

    await send(MESSAGE);
    await send(MESSAGE);

    expect(callsTo(TOKEN_URL)).toHaveLength(1);
    expect(callsTo(SEND_URL).map((call) => headerOf(call.init, "authorization"))).toEqual([
      "Bearer token-1",
      "Bearer token-1",
    ]);
  });

  it("tras un 401 de Graph pide un token nuevo en el siguiente envío", async () => {
    replies[TOKEN_URL].push(tokenReply("token-revocado"), tokenReply("token-2"));
    replies[SEND_URL].push(json(401, { error: { code: "InvalidAuthenticationToken", message: "Access token has expired." } }), accepted());
    const send = createGraphMailSender(CREDENTIALS, 1000);

    await expect(send(MESSAGE)).rejects.toThrow("HTTP 401: InvalidAuthenticationToken: Access token has expired.");
    await send(MESSAGE);

    expect(callsTo(TOKEN_URL)).toHaveLength(2);
    expect(headerOf(callsTo(SEND_URL)[1].init, "authorization")).toBe("Bearer token-2");
  });

  it("explica por qué Entra ID no da el token, sin exponer el secreto ni intentar el envío", async () => {
    replies[TOKEN_URL].push(
      json(401, { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided." }),
    );

    const failure = createGraphMailSender(CREDENTIALS, 1000)(MESSAGE);

    await expect(failure).rejects.toThrow(
      "Microsoft Entra ID no entregó el token (HTTP 401: invalid_client: AADSTS7000215: Invalid client secret provided.)",
    );
    await expect(failure).rejects.not.toThrow(CREDENTIALS.clientSecret);
    expect(callsTo(SEND_URL)).toHaveLength(0);
  });

  it("explica por qué Graph rechaza el correo", async () => {
    replies[TOKEN_URL].push(tokenReply("token-1"));
    replies[SEND_URL].push(json(403, { error: { code: "ErrorAccessDenied", message: "Access is denied." } }));

    await expect(createGraphMailSender(CREDENTIALS, 1000)(MESSAGE)).rejects.toThrow(
      "Microsoft Graph rechazó el correo (HTTP 403: ErrorAccessDenied: Access is denied.)",
    );
  });

  it("sin remitente falla antes de llamar a Microsoft", async () => {
    await expect(createGraphMailSender(CREDENTIALS, 1000)({ ...MESSAGE, from: undefined })).rejects.toThrow("SMTP_FROM");
    expect(calls).toHaveLength(0);
  });
});

describe("elección del transporte", () => {
  const previous = { transport: config.mailTransport, graph: { ...config.graph }, from: config.smtp.from, host: config.smtp.host };

  beforeEach(() => {
    resetEmailTransport();
  });

  afterEach(() => {
    config.mailTransport = previous.transport;
    config.graph = { ...previous.graph };
    config.smtp.from = previous.from;
    config.smtp.host = previous.host;
    resetEmailTransport();
  });

  it("con Graph solo cuenta como configurado si están el tenant, el cliente y el secreto", () => {
    config.mailTransport = "graph";
    config.smtp.host = "smtp.office365.com";
    config.graph = { ...CREDENTIALS, clientSecret: "" };
    expect(isMailConfigured()).toBe(false);

    config.graph = { ...CREDENTIALS };
    expect(isMailConfigured()).toBe(true);
  });

  it("con SMTP depende de SMTP_HOST, aunque haya credenciales de Graph", () => {
    config.mailTransport = "smtp";
    config.graph = { ...CREDENTIALS };
    config.smtp.host = "";
    expect(isMailConfigured()).toBe(false);
  });

  it("con Graph a medio configurar, el error dice qué variables faltan", async () => {
    config.mailTransport = "graph";
    config.graph = { ...CREDENTIALS, tenantId: "" };

    await expect(sendMail(MESSAGE)).rejects.toThrow("MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID y MS_GRAPH_CLIENT_SECRET");
    expect(calls).toHaveLength(0);
  });

  it("con Graph configurado, sendMail envía desde el buzón de SMTP_FROM", async () => {
    config.mailTransport = "graph";
    config.graph = { ...CREDENTIALS };
    config.smtp.from = FROM;
    replies[TOKEN_URL].push(tokenReply("token-1"));
    replies[SEND_URL].push(accepted());

    await sendMail({ to: "ana@example.com", subject: "Invitación", text: "Hola", html: "<p>Hola</p>" });

    const [sendCall] = callsTo(SEND_URL);
    expect(decodedMime(sendCall.init)).toContain(`From: ${FROM}`);
  });
});
