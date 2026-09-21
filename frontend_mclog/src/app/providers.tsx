"use client";
import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/molecules/Toast";
import { Locale } from "@/common/i18n/config";
import { I18nProvider } from "@/common/i18n/I18nProvider";
import { ThemePreference } from "@/common/theme/config";
import { ThemeProvider } from "@/common/theme/ThemeProvider";

export function Providers({
  children,
  initialLocale,
  initialTheme,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
  initialTheme: ThemePreference;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialPreference={initialTheme}>
        <I18nProvider initialLocale={initialLocale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
