import axios from "axios";
import { API_BASE } from "@/config/api";
import { getActiveWorkspaceId, whenWorkspaceReady } from "@/common/workspace/active";

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Datos de un espacio: logs, claves, alertas... La gestion de espacios lleva
// el id en la ruta y la configuracion es de toda la plataforma: ninguna de las
// dos necesita cabecera ni esperar a saber el espacio.
const WORKSPACE_SCOPED = /^\/(api\/(?!(workspaces|settings)(\/|$))|mcp(\/|$))/;

// Las peticiones de datos esperan a saber el espacio activo y lo mandan en
// X-Workspace-Id. Asi el panel nunca pide datos de un espacio equivocado.
client.interceptors.request.use(async (config) => {
  if (!WORKSPACE_SCOPED.test(config.url ?? "")) return config;
  await whenWorkspaceReady();
  const workspaceId = getActiveWorkspaceId();
  if (workspaceId !== null) config.headers.set("X-Workspace-Id", String(workspaceId));
  return config;
});

// El acceso vive en "/" (y en su alias /login): desde ahi no se redirige.
const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  const { pathname } = window.location;
  if (pathname !== "/" && !pathname.startsWith("/login")) window.location.href = "/";
};

// Endpoints donde un 401 no significa "sesion caducada": reintentarlos tras un
// refresh no tiene sentido. /auth/me si se reintenta: es lo que decide si el
// panel manda al login. Un snapshot tampoco: el servidor ya renueva la sesion
// si puede, y su 401 significa "de equipo y sin sesion".
const NO_REFRESH = /\/auth\/(login|refresh|logout)(\/|$)|^\/snapshots\//;

// /auth/me sin sesion no manda al login por su cuenta: la portada lo consulta
// solo para saber si hay sesion, y el panel ya redirige con ?next= al fallar.
// Un snapshot de equipo tampoco: su pagina ofrece entrar sin perder el enlace.
const NO_REDIRECT = /\/auth\/me$|^\/snapshots\//;

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
