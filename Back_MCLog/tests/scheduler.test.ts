import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/config/prisma";
import { config } from "../src/config/env";
import { runRefreshTokenCleanupNow, runRetentionNow } from "../src/jobs/scheduler";
import { deleteLogsOlderThanInBatches } from "../src/services/logService";
import { ensureAdminUser } from "../src/services/authService";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;

const retentionDaysOriginal = config.retentionDays;
let userId: number;

/** Inserta un log con una antiguedad concreta, en dias. */
const logAgedDays = (days: number, application = "retencion") => ({
  application,
  service: application,
  level: "info" as const,
  environment: "development" as const,
  message: `log de hace ${days} dias`,
  timestamp: new Date(Date.now() - days * DAY_MS),
});

beforeAll(async () => {
  await ensureAdminUser();
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "admin" } });
  userId = admin.id;
});

afterEach(async () => {
  config.retentionDays = retentionDaysOriginal;
  await prisma.log.deleteMany({ where: { application: { in: ["retencion", "lotes"] } } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Purga por retencion", () => {
  it("borra solo los logs mas antiguos que la ventana configurada", async () => {
    await prisma.log.createMany({
      data: [logAgedDays(10), logAgedDays(5), logAgedDays(3), logAgedDays(0.5), logAgedDays(0)],
    });
    config.retentionDays = 2;

    const deleted = await runRetentionNow();
    expect(deleted).toBe(3);

    const quedan = await prisma.log.findMany({ where: { application: "retencion" } });
    expect(quedan).toHaveLength(2);
    // Lo que sobrevive esta dentro de la ventana.
    const limite = Date.now() - 2 * DAY_MS;
    expect(quedan.every((row) => row.timestamp.getTime() >= limite)).toBe(true);
  });

  it("no borra nada con RETENTION_DAYS=0", async () => {
    await prisma.log.createMany({ data: [logAgedDays(365), logAgedDays(500)] });
    config.retentionDays = 0;

    const deleted = await runRetentionNow();
    expect(deleted).toBe(0);
    expect(await prisma.log.count({ where: { application: "retencion" } })).toBe(2);
  });

  it("recorre todos los lotes cuando hay mas filas que el tamano de lote", async () => {
    await prisma.log.createMany({
      data: Array.from({ length: 12 }, () => logAgedDays(30, "lotes")),
    });

    // Tamano de lote deliberadamente pequeno: obliga a dar varias vueltas.
    const deleted = await deleteLogsOlderThanInBatches(new Date(Date.now() - DAY_MS), 5);
    expect(deleted).toBe(12);
    expect(await prisma.log.count({ where: { application: "lotes" } })).toBe(0);
  });
});

describe("Limpieza de refresh tokens", () => {
  it("elimina los caducados y conserva los vigentes", async () => {
    await prisma.refreshToken.createMany({
      data: [
        { token: "caducado-hace-tiempo", userId, expiresAt: new Date(Date.now() - 5 * DAY_MS) },
        // Caducado hace una hora: dentro del margen de un dia, aun se conserva.
        { token: "recien-caducado", userId, expiresAt: new Date(Date.now() - 60 * 60 * 1000) },
        { token: "vigente", userId, expiresAt: new Date(Date.now() + 5 * DAY_MS) },
      ],
    });

    const deleted = await runRefreshTokenCleanupNow();
    expect(deleted).toBe(1);

    const restantes = (await prisma.refreshToken.findMany({ where: { userId } })).map((row) => row.token);
    expect(restantes.sort()).toEqual(["recien-caducado", "vigente"]);
  });
});
