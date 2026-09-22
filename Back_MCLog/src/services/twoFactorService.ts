import { createHash, randomBytes } from "crypto";
import { prisma } from "../config/prisma";
import { qrSvg } from "../utils/qrCode";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../utils/totp";
import { UserServiceError } from "./userService";

const ISSUER = "MCLog";
const RECOVERY_CODE_COUNT = 8;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Formato "xxxxx-xxxxx": se lee y se teclea bien, y los guiones se ignoran al comprobar. */
const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

const generateRecoveryCodes = (): string[] =>
  Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });

/**
 * Genera un secreto nuevo y lo deja pendiente de confirmar. Si el usuario ya
 * tenia el segundo factor activo hay que desactivarlo antes: si no, cualquiera
 * con la sesion abierta podria sustituir el dispositivo del titular.
 */
export const startTwoFactorSetup = async (userId: number) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserServiceError("User not found", 404);
  if (user.twoFactorEnabled) throw new UserServiceError("Two-factor authentication is already enabled", 409);

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret, twoFactorLastStep: null } });

  const uri = otpauthUri(secret, user.email, ISSUER);
  return {
    secret,
    otpauthUri: uri,
    qrCode: `data:image/svg+xml;base64,${Buffer.from(qrSvg(uri)).toString("base64")}`,
  };
};

/** Activa el segundo factor tras comprobar un codigo y devuelve los codigos de recuperacion en claro, una sola vez. */
export const confirmTwoFactorSetup = async (userId: number, code: string): Promise<string[]> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserServiceError("User not found", 404);
  if (user.twoFactorEnabled) throw new UserServiceError("Two-factor authentication is already enabled", 409);
  if (!user.twoFactorSecret) throw new UserServiceError("Start the two-factor setup first", 409);

  const step = verifyTotp(user.twoFactorSecret, code);
  if (step === null) throw new UserServiceError("Invalid verification code", 400);

  const recoveryCodes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorLastStep: step,
      recoveryCodes: recoveryCodes.map((c) => sha256(normalizeRecoveryCode(c))),
    },
  });
  return recoveryCodes;
};

/**
 * Comprueba un segundo factor: un codigo TOTP o, en su defecto, un codigo de
 * recuperacion, que se consume al usarse. Devuelve false si no vale.
 */
export const verifySecondFactor = async (userId: number, code: string | undefined): Promise<boolean> => {
  if (!code) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) return false;

  const step = verifyTotp(user.twoFactorSecret, code, user.twoFactorLastStep);
  if (step !== null) {
    // Condicion en el where: dos peticiones simultaneas con el mismo codigo no
    // pueden ganar las dos.
    const updated = await prisma.user.updateMany({
      where: { id: userId, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
      data: { twoFactorLastStep: step },
    });
    return updated.count === 1;
  }

  const hash = sha256(normalizeRecoveryCode(code));
  if (!user.recoveryCodes.includes(hash)) return false;
  const consumed = await prisma.user.updateMany({
    where: { id: userId, recoveryCodes: { has: hash } },
    data: { recoveryCodes: user.recoveryCodes.filter((c) => c !== hash) },
  });
  return consumed.count === 1;
};

export const disableTwoFactor = (userId: number) =>
  prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null, recoveryCodes: [] },
  });
