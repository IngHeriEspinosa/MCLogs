import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * TOTP segun RFC 6238 (HMAC-SHA1, 6 digitos, pasos de 30 s): lo que esperan
 * Google Authenticator, Microsoft Authenticator, 1Password, Authy...
 *
 * Se implementa aqui en lugar de traer una dependencia porque son pocas lineas
 * sobre `crypto` y asi no hay nada de terceros en la ruta del login.
 */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Pasos de margen a cada lado, por relojes desajustados. */
const DRIFT_STEPS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (buffer: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

export const base32Decode = (input: string): Buffer => {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

/** 160 bits, el tamano que recomienda la RFC 4226 para HMAC-SHA1. */
export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

export const currentStep = (now = Date.now()): number => Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);

export const totpAt = (secret: string, step: number): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
};

const sameCode = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Comprueba un codigo y devuelve el paso al que corresponde, o null.
 *
 * Los pasos iguales o anteriores a `lastUsedStep` se rechazan: un codigo ya
 * aceptado no vuelve a valer aunque siga dentro de su ventana, asi que quien
 * lo vea por encima del hombro no puede reutilizarlo.
 */
export const verifyTotp = (
  secret: string,
  code: string,
  lastUsedStep: number | null = null,
  now = Date.now(),
): number | null => {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d+$/.test(normalized) || normalized.length !== TOTP_DIGITS) return null;
  const step = currentStep(now);
  for (let delta = -DRIFT_STEPS; delta <= DRIFT_STEPS; delta++) {
    const candidate = step + delta;
    if (lastUsedStep !== null && candidate <= lastUsedStep) continue;
    if (sameCode(totpAt(secret, candidate), normalized)) return candidate;
  }
  return null;
};

/** URI que leen las apps autenticadoras, normalmente a traves de un QR. */
export const otpauthUri = (secret: string, account: string, issuer: string): string => {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};
