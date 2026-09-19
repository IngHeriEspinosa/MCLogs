import { AxiosError } from "axios";

/**
 * Extrae un mensaje legible de un error de la API.
 *
 * El backend responde con dos formas distintas: `{ error }` para los fallos de
 * negocio y `{ status: "error", errors: { campo: { msg } } }` para los de
 * validacion. Sin esto, la interfaz acabaria mostrando "Request failed with
 * status code 400", que no le dice nada a nadie.
 */
export const errorMessage = (error: unknown, fallback = "Ha ocurrido un error"): string => {
  const axiosError = error as AxiosError<{ error?: string; errors?: Record<string, { msg?: string }> }>;
  const data = axiosError?.response?.data;

  if (data?.error) return data.error;

  if (data?.errors) {
    const detalles = Object.entries(data.errors)
      .map(([campo, detalle]) => detalle?.msg ?? campo)
      .filter(Boolean);
    if (detalles.length > 0) return detalles.join(". ");
  }

  if (axiosError?.message) return axiosError.message;
  return fallback;
};
