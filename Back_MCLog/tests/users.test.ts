import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPrismaClient } from "../src/config/prisma";
import app from "../src/app";
import { ensureAdminUser } from "../src/services/authService";

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const prisma = createPrismaClient();

let adminToken: string;
let adminId: number;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const loginAs = async (email: string, password: string) => {
  const res = await request(app).post("/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
};

/** Usuarios creados por los tests, para no arrastrar basura entre ejecuciones. */
const MANAGED_EMAILS = [
  "nuevo@example.com",
  "cambio@example.com",
  "segundo.admin@example.com",
  "desechable@example.com",
];

beforeAll(async () => {
  await ensureAdminUser();
  await prisma.user.deleteMany({ where: { email: { in: MANAGED_EMAILS } } });

  adminToken = await loginAs(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  const me = await request(app).get("/auth/me").set(auth(adminToken));
  adminId = me.body.data.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: MANAGED_EMAILS } } });
  await prisma.$disconnect();
});

describe("Sesion actual", () => {
  it("devuelve el usuario autenticado sin exponer el hash", async () => {
    const res = await request(app).get("/auth/me").set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(process.env.ADMIN_EMAIL);
    expect(res.body.data.role).toBe("admin");
    expect(res.body.data).not.toHaveProperty("passwordHash");
  });

  it("exige sesion", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("Alta y administracion de usuarios", () => {
  it("crea un usuario con rol user por defecto", async () => {
    const res = await request(app)
      .post("/auth/users")
      .set(auth(adminToken))
      .send({ email: "nuevo@example.com", password: "ContrasenaLarga1" });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("user");
    expect(res.body.data).not.toHaveProperty("passwordHash");

    // El usuario recien creado puede iniciar sesion.
    const token = await loginAs("nuevo@example.com", "ContrasenaLarga1");
    expect(token).toBeTruthy();
  });

  it("rechaza un email repetido", async () => {
    const res = await request(app)
      .post("/auth/users")
      .set(auth(adminToken))
      .send({ email: "nuevo@example.com", password: "OtraContrasena1" });
    expect(res.status).toBe(409);
  });

  it("rechaza contrasenas cortas y roles desconocidos", async () => {
    const corta = await request(app)
      .post("/auth/users")
      .set(auth(adminToken))
      .send({ email: "corta@example.com", password: "corta" });
    expect(corta.status).toBe(400);

    const rol = await request(app)
      .post("/auth/users")
      .set(auth(adminToken))
      .send({ email: "rol@example.com", password: "ContrasenaLarga1", role: "superadmin" });
    expect(rol.status).toBe(400);
  });

  it("impide a un usuario sin rol admin administrar usuarios", async () => {
    const token = await loginAs("nuevo@example.com", "ContrasenaLarga1");
    expect((await request(app).get("/auth/users").set(auth(token))).status).toBe(403);
    expect(
      (await request(app).post("/auth/users").set(auth(token)).send({ email: "x@example.com", password: "ContrasenaLarga1" }))
        .status,
    ).toBe(403);
  });

  it("lista los usuarios existentes", async () => {
    const res = await request(app).get("/auth/users").set(auth(adminToken));
    expect(res.status).toBe(200);
    const emails = res.body.data.map((u: { email: string }) => u.email);
    expect(emails).toContain(process.env.ADMIN_EMAIL);
    expect(emails).toContain("nuevo@example.com");

    // El admin administra todo: ve en que espacios esta cada cuenta y con que rol.
    type Row = { email: string; workspaces: { id: number; name: string; role: string }[]; workspaceCount: number };
    const nuevo = res.body.data.find((u: Row) => u.email === "nuevo@example.com") as Row;
    expect(nuevo.workspaces).toHaveLength(1);
    expect(nuevo.workspaces[0]).toMatchObject({ role: "owner" });
    expect(typeof nuevo.workspaces[0].name).toBe("string");
    expect(nuevo.workspaceCount).toBe(1);
  });

  it("cambia el rol de un usuario y cierra sus sesiones", async () => {
    const lista = await request(app).get("/auth/users").set(auth(adminToken));
    const objetivo = lista.body.data.find((u: { email: string }) => u.email === "nuevo@example.com");

    const login = await request(app).post("/auth/login").send({ email: "nuevo@example.com", password: "ContrasenaLarga1" });
    const refreshAntiguo = login.body.refreshToken;

    const res = await request(app).patch(`/auth/users/${objetivo.id}`).set(auth(adminToken)).send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("admin");

    // El cambio de rol invalida los refresh tokens: el siguiente token debe reflejarlo.
    const reuso = await request(app).post("/auth/refresh").send({ refreshToken: refreshAntiguo });
    expect(reuso.status).toBe(401);

    // Se devuelve a su rol original para no alterar el resto de la suite.
    await request(app).patch(`/auth/users/${objetivo.id}`).set(auth(adminToken)).send({ role: "user" });
  });

  it("exige indicar algo que actualizar", async () => {
    const res = await request(app).patch(`/auth/users/${adminId}`).set(auth(adminToken)).send({});
    expect(res.status).toBe(400);
  });

  it("devuelve 404 al actualizar un usuario inexistente", async () => {
    const res = await request(app).patch("/auth/users/999999").set(auth(adminToken)).send({ role: "user" });
    expect(res.status).toBe(404);
  });
});

describe("Salvaguardas de administracion", () => {
  it("impide borrarse a uno mismo", async () => {
    const res = await request(app).delete(`/auth/users/${adminId}`).set(auth(adminToken));
    expect(res.status).toBe(409);
  });

  it("impide degradar la cuenta root", async () => {
    // El admin de ADMIN_EMAIL es root: ni el mismo puede quitarse el rol.
    const res = await request(app).patch(`/auth/users/${adminId}`).set(auth(adminToken)).send({ role: "user" });
    expect(res.status).toBe(403);

    const sigueSiendoAdmin = await request(app).get("/auth/me").set(auth(adminToken));
    expect(sigueSiendoAdmin.body.data.role).toBe("admin");
  });

  it("permite borrar a otro usuario", async () => {
    const creado = await request(app)
      .post("/auth/users")
      .set(auth(adminToken))
      .send({ email: "desechable@example.com", password: "ContrasenaLarga1" });
    expect(creado.status).toBe(201);

    const res = await request(app).delete(`/auth/users/${creado.body.data.id}`).set(auth(adminToken));
    expect(res.status).toBe(200);

    const login = await request(app).post("/auth/login").send({ email: "desechable@example.com", password: "ContrasenaLarga1" });
    expect(login.status).toBe(401);
  });
});

describe("Cambio de contrasena propia", () => {
  it("rechaza una contrasena actual incorrecta", async () => {
    await request(app)
      .post("/auth/users")
      .set(auth(adminToken))
      .send({ email: "cambio@example.com", password: "ContrasenaLarga1" });
    const token = await loginAs("cambio@example.com", "ContrasenaLarga1");

    const res = await request(app)
      .patch("/auth/me/password")
      .set(auth(token))
      .send({ currentPassword: "NoEsLaMia1", newPassword: "ContrasenaNueva1" });
    expect(res.status).toBe(400);
  });

  it("rechaza reutilizar la misma contrasena", async () => {
    const token = await loginAs("cambio@example.com", "ContrasenaLarga1");
    const res = await request(app)
      .patch("/auth/me/password")
      .set(auth(token))
      .send({ currentPassword: "ContrasenaLarga1", newPassword: "ContrasenaLarga1" });
    expect(res.status).toBe(400);
  });

  it("cambia la contrasena y deja de aceptar la anterior", async () => {
    const login = await request(app).post("/auth/login").send({ email: "cambio@example.com", password: "ContrasenaLarga1" });
    const token = login.body.accessToken;
    const refreshAntiguo = login.body.refreshToken;

    const res = await request(app)
      .patch("/auth/me/password")
      .set(auth(token))
      .send({ currentPassword: "ContrasenaLarga1", newPassword: "ContrasenaNueva1" });
    expect(res.status).toBe(200);

    const vieja = await request(app).post("/auth/login").send({ email: "cambio@example.com", password: "ContrasenaLarga1" });
    expect(vieja.status).toBe(401);

    const nueva = await request(app).post("/auth/login").send({ email: "cambio@example.com", password: "ContrasenaNueva1" });
    expect(nueva.status).toBe(200);

    // Cambiar la contrasena cierra la sesion tambien en los demas dispositivos.
    const reuso = await request(app).post("/auth/refresh").send({ refreshToken: refreshAntiguo });
    expect(reuso.status).toBe(401);
  });
});
