"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/common/i18n/I18nProvider";
import type { BufferedLog } from "@/hooks/useLogStream";

/** Como mucho un aviso cada 30 s: los errores que lleguen entre medias se suman al siguiente. */
const MIN_GAP_MS = 30_000;
const BODY_MAX = 140;

/**
 * Notificaciones del navegador para los errores que llegan en vivo. Son
 * opcionales (las activa el usuario y el navegador pide permiso) y solo saltan
 * con la pestana oculta: con ella a la vista, el error ya se ve en la tabla.
 */
export const useLiveNotifications = (enabled: boolean, logs: BufferedLog[]) => {
  const { t } = useI18n();
  // Se decide tras montar: en el servidor no hay Notification y algunos
  // navegadores (Safari en iOS fuera de una PWA) tampoco la tienen.
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(typeof window !== "undefined" && "Notification" in window), []);

  const seen = useRef(new Set<string>());
  const pending = useRef<BufferedLog[]>([]);
  const lastAt = useRef(0);

  useEffect(() => {
    const errors = logs.filter((log) => log.level === "error");
    const fresh = errors.filter((log) => !seen.current.has(log.streamKey));
    // Solo se recuerdan los que siguen en el buffer: las claves del stream no
    // se reutilizan, y asi el conjunto no crece en una sesion larga.
    seen.current = new Set(errors.map((log) => log.streamKey));
    if (!enabled || !supported || Notification.permission !== "granted") return;
    if (document.visibilityState !== "hidden") {
      pending.current = [];
      return;
    }
    pending.current.push(...fresh);
    const now = Date.now();
    if (pending.current.length === 0 || now - lastAt.current < MIN_GAP_MS) return;

    const [first] = pending.current;
    const message = first.message.length > BODY_MAX ? `${first.message.slice(0, BODY_MAX - 1)}…` : first.message;
    const notice = new Notification(t.logs.notify.title(pending.current.length), {
      body: `${first.application}: ${message}`,
      // Mismo tag: un aviso nuevo sustituye al anterior en lugar de apilarse.
      tag: "mclog-live-errors",
      icon: "/pwa-icon/192",
    });
    notice.onclick = () => {
      window.focus();
      notice.close();
    };
    lastAt.current = now;
    pending.current = [];
  }, [logs, enabled, supported, t]);

  /** Pide permiso si hace falta. Devuelve si las notificaciones quedan permitidas. */
  const requestPermission = async () => {
    if (!supported) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  };

  return { supported, requestPermission };
};
