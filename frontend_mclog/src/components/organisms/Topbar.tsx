"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/atoms/Button";
import { Icon, IconName } from "@/components/atoms/Icon";
import { Tag } from "@/components/atoms/Tag";
import { Menu } from "@/components/molecules/Menu";
import { useI18n } from "@/common/i18n/I18nProvider";
import { LOCALES } from "@/common/i18n/config";
import { useTheme } from "@/common/theme/ThemeProvider";
import { ThemePreference } from "@/common/theme/config";
import { CurrentUser, useLogout } from "@/hooks/useAuth";
import type { WorkspaceRole } from "@/hooks/useWorkspaces";

const THEME_ICON = { light: "sun", dark: "moon", system: "monitor" } as const;

const DOCS_URL = "https://ingheriespinosa.github.io/MCLogs/";
const REPO_URL = "https://github.com/IngHeriEspinosa/MCLogs";

const ExternalIconLink: React.FC<{ href: string; icon: IconName; label: string }> = ({ href, icon, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    title={label}
    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink hover:no-underline"
  >
    <Icon name={icon} className="h-4 w-4" />
  </a>
);

/** Documentacion y repositorio del proyecto; se abren en otra pestana. */
export const ProjectLinks: React.FC = () => {
  const { t } = useI18n();
  return (
    <>
      <ExternalIconLink href={DOCS_URL} icon="book" label={t.app.docs} />
      <ExternalIconLink href={REPO_URL} icon="github" label={t.app.sourceCode} />
    </>
  );
};

/** Selector de tema: claro, oscuro o el del sistema. */
export const ThemeMenu: React.FC = () => {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  const options: ThemePreference[] = ["light", "dark", "system"];
  return (
    <Menu
      label={t.prefs.theme}
      icon={THEME_ICON[preference]}
      iconOnly
      variant="ghost"
      compact
      items={[
        { type: "label", key: "label", label: t.prefs.theme },
        ...options.map((option) => ({
          key: option,
          label: t.prefs.themes[option],
          icon: THEME_ICON[option],
          checked: preference === option,
          onSelect: () => setPreference(option),
        })),
      ]}
    />
  );
};

/** Selector de idioma. El cambio es inmediato y se recuerda en una cookie. */
export const LanguageMenu: React.FC = () => {
  const { t, locale, setLocale } = useI18n();
  return (
    <Menu
      label={t.prefs.language}
      trigger={
        <span className="flex items-center gap-1.5">
          <Icon name="globe" className="h-4 w-4" />
          {/* La caja de una linea de texto incluye el hueco de los trazos que
              bajan de la linea base, que estas mayusculas no usan: centrarla
              deja el codigo un pixel por encima del icono. `text-box` recorta
              la caja a la altura de las mayusculas, asi que el centrado es
              exacto a cualquier tamano de fuente. Donde no este soportado se
              ve como antes, no peor. */}
          <span className="font-mono text-[0.6875rem] font-semibold uppercase [text-box:trim-both_cap_alphabetic]">
            {locale}
          </span>
        </span>
      }
      triggerClassName="inline-flex h-9 items-center rounded-lg px-2.5 text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
      compact
      items={[
        { type: "label", key: "label", label: t.prefs.language },
        // Sin el codigo como segunda linea: "Español" ya dice lo mismo que "ES"
        // y doblaba el alto de cada fila.
        ...LOCALES.map((option) => ({
          key: option,
          label: t.prefs.languages[option],
          checked: locale === option,
          onSelect: () => setLocale(option),
        })),
      ]}
    />
  );
};

const UserMenu: React.FC<{ me: CurrentUser; workspaceRole?: WorkspaceRole }> = ({ me, workspaceRole }) => {
  const { t } = useI18n();
  const router = useRouter();
  const logout = useLogout();
  const initial = me.email.charAt(0).toUpperCase();

  return (
    <Menu
      label={t.nav.userMenu}
      trigger={
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-solid font-heading text-sm font-semibold text-white ring-2 ring-surface">
          {initial}
        </span>
      }
      triggerClassName="ml-1 rounded-full"
      header={
        <div className="mb-1 border-b border-line px-2.5 pb-2.5 pt-1.5">
          <p className="truncate text-sm font-medium text-ink">{me.email}</p>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {workspaceRole && <Tag tone={workspaceRole === "owner" ? "brand" : "neutral"}>{t.workspace.roles[workspaceRole]}</Tag>}
            {me.role === "admin" && <Tag tone="accent">{t.nav.roles.admin}</Tag>}
          </span>
        </div>
      }
      items={[
        { key: "account", label: t.nav.account, icon: "user", onSelect: () => router.push("/settings/password") },
        { type: "separator", key: "separator" },
        { key: "logout", label: t.nav.logout, icon: "logout", danger: true, onSelect: () => logout.mutate() },
      ]}
    />
  );
};

type TopbarProps = {
  title: string;
  section?: string;
  onOpenMenu: () => void;
  me?: CurrentUser;
  /** Rol en el espacio activo, que es el que decide lo que se puede hacer. */
  workspaceRole?: WorkspaceRole;
};

export const Topbar: React.FC<TopbarProps> = ({ title, section, onOpenMenu, me, workspaceRole }) => {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-canvas/80 px-4 backdrop-blur-md sm:px-6 xl:px-8 3xl:px-10">
      <IconButton icon="menu" label={t.nav.openMenu} onClick={onOpenMenu} className="-ml-2 lg:hidden" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        {section && (
          <>
            <span className="hidden truncate text-ink-3 sm:inline">{section}</span>
            <Icon name="chevronRight" className="hidden h-3.5 w-3.5 text-ink-3 sm:block" />
          </>
        )}
        <span aria-current="page" className="truncate font-medium text-ink">
          {title}
        </span>
      </nav>
      <div className="ml-auto flex items-center gap-0.5">
        <LanguageMenu />
        <ThemeMenu />
        {me && <UserMenu me={me} workspaceRole={workspaceRole} />}
      </div>
    </header>
  );
};
