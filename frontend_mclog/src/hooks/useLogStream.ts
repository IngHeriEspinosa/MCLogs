import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { API_BASE } from "@/config/api";
import { getActiveWorkspaceId, subscribeActiveWorkspace } from "@/common/workspace/active";
import type { LogEntry } from "@/hooks/useAuth";

/** Log recibido por el stream: sin metadata ni stack, que ahí no aportan. */
export type StreamedLog = Pick<
  LogEntry,
  "id" | "timestamp" | "application" | "service" | "host" | "level" | "environment" | "message" | "traceId" | "errorName" | "fingerprint"
>;

/**
 * Log del stream con una clave local para React.
 *
 * Los logs enviados en lote llegan sin `id`, porque `createMany` no devuelve
 * las filas creadas, asi que no sirve como clave de lista.
 */
export type BufferedLog = StreamedLog & { streamKey: string };

export type StreamFilters = {
  level?: string;
  application?: string;
  environment?: string;
};

export type StreamStatus = "off" | "connecting" | "live" | "error";

/**
 * Conexión al stream de logs en vivo.
 *
 * Usa EventSource, que no admite cabeceras propias: la autenticación viaja en
 * la cookie de sesión, igual que el resto del dashboard, y el espacio en
 * `?workspace=`. El navegador reconecta solo si la conexión se cae, así que
 * aquí no hay lógica de reintento. Al cambiar de espacio se reabre.
 */
export const useLogStream = (enabled: boolean, filters: StreamFilters, max = 50) => {
  const [logs, setLogs] = useState<BufferedLog[]>([]);
  const [status, setStatus] = useState<StreamStatus>("off");
  const contador = useRef(0);

  // Los filtros se comparan por su forma serializada: un objeto nuevo en cada
  // render reabriría la conexión en bucle.
  const clave = JSON.stringify(filters);
  const maxRef = useRef(max);
  maxRef.current = max;
  const workspaceId = useSyncExternalStore(subscribeActiveWorkspace, getActiveWorkspaceId, () => null);

  useEffect(() => {
    if (!enabled || workspaceId === null) {
      setStatus("off");
      setLogs([]);
      return;
    }

    const params = new URLSearchParams(
      Object.entries(JSON.parse(clave) as StreamFilters).filter(([, valor]) => valor) as [string, string][],
    );
    params.set("workspace", String(workspaceId));
    setLogs([]);

    setStatus("connecting");
    const source = new EventSource(`${API_BASE}/api/logs/stream?${params.toString()}`, { withCredentials: true });

    source.addEventListener("ready", () => setStatus("live"));
    source.addEventListener("log", (event) => {
      try {
        const log = JSON.parse((event as MessageEvent).data) as StreamedLog;
        contador.current += 1;
        const bufferizado: BufferedLog = { ...log, streamKey: `live-${contador.current}` };
        setLogs((previos) => [bufferizado, ...previos].slice(0, maxRef.current));
      } catch {
        // Un mensaje mal formado no debe tumbar la vista.
      }
    });
    source.onerror = () => setStatus("error");

    return () => {
      source.close();
      setStatus("off");
    };
  }, [enabled, clave, workspaceId]);

  return { logs, status, clear: () => setLogs([]) };
};
