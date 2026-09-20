import type { AlertChannel, AlertChannelType } from "@prisma/client";
import logger from "../../config/logger";
import type { AlertPayload, Notifier } from "../types";
import { sendEmail } from "./email";
import { sendTelegram } from "./telegram";
import { sendWebhook } from "./webhook";

/** Resultado del envío a un canal, que se guarda en el AlertEvent. */
export type Delivery = {
  channelId: number;
  channelName: string;
  ok: boolean;
  error?: string;
};

const NOTIFIERS: Record<AlertChannelType, Notifier> = {
  webhook: sendWebhook,
  email: sendEmail,
  telegram: sendTelegram,
};

/**
 * Tabla de notificadores, sustituible en los tests para no salir a la red.
 * Se expone como objeto mutable a propósito: inyectar un doble por constructor
 * obligaría a arrastrarlo por todo el evaluador y el planificador.
 */
export const notifiers: Record<AlertChannelType, Notifier> = { ...NOTIFIERS };

/** Solo para tests: restaura los notificadores reales. */
export const resetNotifiers = () => Object.assign(notifiers, NOTIFIERS);

/**
 * Envía un aviso por todos los canales indicados.
 *
 * Nunca lanza: un canal caído no debe impedir el aviso por los demás ni tumbar
 * la evaluación. Cada resultado queda registrado para poder verlo después en
 * el historial.
 */
export const deliverToChannels = async (
  channels: AlertChannel[],
  payload: AlertPayload,
): Promise<Delivery[]> =>
  Promise.all(
    channels.map(async (channel): Promise<Delivery> => {
      const base = { channelId: channel.id, channelName: channel.name };
      try {
        await notifiers[channel.type](channel, payload);
        return { ...base, ok: true };
      } catch (error) {
        const detalle = error instanceof Error ? error.message : String(error);
        logger.error("Alert delivery failed", {
          channelId: channel.id,
          channelType: channel.type,
          rule: payload.rule.name,
          error: detalle,
        });
        return { ...base, ok: false, error: detalle };
      }
    }),
  );

export { sendEmail, sendTelegram, sendWebhook };
