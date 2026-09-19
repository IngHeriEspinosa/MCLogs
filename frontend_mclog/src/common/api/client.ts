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

client.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = original?.url?.includes("/auth/");
    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        await client.post("/auth/refresh", {}, { withCredentials: true });
        return client(original);
      } catch (err) {
        redirectToLogin();
        return Promise.reject(err);
      }
    }
    if (error.response?.status === 401 && !isAuthEndpoint) {
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export default client;
