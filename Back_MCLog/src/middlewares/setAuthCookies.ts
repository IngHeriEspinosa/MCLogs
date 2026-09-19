import { Response } from "express";
import { config } from "../config/env";

type SameSite = "lax" | "strict" | "none";

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  const base = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite as SameSite,
    domain: config.cookieDomain,
    path: "/",
  } as const;

  res.cookie("access_token", accessToken, { ...base, maxAge: 7 * 24 * 3600 * 1000 });
  res.cookie("refresh_token", refreshToken, { ...base, maxAge: 14 * 24 * 3600 * 1000 });
};

export const clearAuthCookies = (res: Response) => {
  const base = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite as SameSite,
    domain: config.cookieDomain,
    path: "/",
  } as const;
  res.clearCookie("access_token", base);
  res.clearCookie("refresh_token", base);
};
