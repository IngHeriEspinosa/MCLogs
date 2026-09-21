import client from "@/common/api/client";
import type { LogsParams } from "@/hooks/useAuth";

/** Ofrece un contenido como descarga, sin pasar por el servidor. */
export const saveFile = (content: BlobPart, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revocar en el mismo tick puede cancelar la descarga en algunos navegadores.
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

// Exporta aplicando los filtros activos del dashboard (hasta MAX_EXPORT_ROWS del backend)
export const downloadLogs = async (format: "csv" | "ndjson", filters: Omit<LogsParams, "page" | "pageSize"> = {}) => {
  const params = Object.fromEntries(
    Object.entries({ ...filters, format }).filter(([, v]) => v !== undefined && v !== "")
  );
  const response = await client.get("/api/logs", {
    params,
    responseType: "blob",
  });
  const filename = format === "csv" ? "logs.csv" : "logs.ndjson";
  saveFile(response.data, filename, format === "csv" ? "text/csv" : "application/x-ndjson");
  return filename;
};
