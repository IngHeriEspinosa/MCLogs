import axios from "axios";
import { API_BASE } from "@/config/api";

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

const redirectToLogin = () => {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
};

// Endpoints donde un 401 no significa "sesion caducada": reintentarlos tras un
// refresh no tiene sentido. /auth/me si se reintenta: es lo que decide si el
// panel manda al login.
const NO_REFRESH = /\/auth\/(login|refresh|logout)(\/|$)/;

// /auth/me sin sesion no manda al login por su cuenta: la portada lo consulta
// solo para saber si hay sesion, y el panel ya redirige con ?next= al fallar.
const NO_REDIRECT = /\/auth\/me$/;

// Un unico refresh en vuelo: si varias peticiones caducan a la vez, todas
// esperan al mismo en lugar de rotar el token cada una por su cuenta.
let refreshing: Promise<unknown> | null = null;
const refreshSession = () => {
  refreshing ??= client.post("/auth/refresh", {}, { withCredentials: true }).finally(() => {
    refreshing = null;
  });
  return refreshing;
};

client.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = NO_REFRESH.test(original?.url ?? "");
    const redirects = !NO_REDIRECT.test(original?.url ?? "");
    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        await refreshSession();
        return client(original);
      } catch (err) {
        if (redirects) redirectToLogin();
        return Promise.reject(err);
      }
    }
    if (error.response?.status === 401 && !isAuthEndpoint && redirects) {
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export default client;
