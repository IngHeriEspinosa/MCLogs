import client from "@/common/api/client";
import type { LogsParams } from "@/hooks/useAuth";

// Exporta aplicando los filtros activos del dashboard (hasta MAX_EXPORT_ROWS del backend)
export const downloadLogs = async (format: "csv" | "ndjson", filters: Omit<LogsParams, "page" | "pageSize"> = {}) => {
  const params = Object.fromEntries(
    Object.entries({ ...filters, format }).filter(([, v]) => v !== undefined && v !== "")
  );
  const response = await client.get("/api/logs", {
    params,
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: format === "csv" ? "text/csv" : "application/x-ndjson" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = format === "csv" ? "logs.csv" : "logs.ndjson";
  link.click();
  window.URL.revokeObjectURL(url);
};
