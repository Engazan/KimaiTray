import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { INTEGRATIONS } from "./integrations/registry";
import { SectionDescription } from "./Controls";
import { ChevronRight } from "./icons";
import { SettingsList } from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Connection whose integrations are being configured. Empty for a
   *  not-yet-saved connection. */
  connectionId: string;
}

export default function IntegrationsSection({
  settings,
  update,
  connectionId,
}: Props) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!connectionId) {
    return (
      <div>
        <SectionDescription>{t("integrations.description")}</SectionDescription>
        <div className="rounded-xl border border-dashed border-[var(--s-line)] px-4 py-5 text-center text-[12px] text-[var(--s-fg-muted)]">
          {t("connection.saveFirstForIntegrations")}
        </div>
      </div>
    );
  }

  const active = INTEGRATIONS.find((i) => i.id === openId);
  if (active) {
    const Detail = active.detail;
    return (
      <Detail
        settings={settings}
        update={update}
        connectionId={connectionId}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <SettingsList title={t("integrations.title")} description={t("integrations.listDescription")}>
      {INTEGRATIONS.map((integration) => {
        const enabled = integration.isEnabled(settings, connectionId);
        return (
          <button
            key={integration.id}
            type="button"
            data-settings-item
            onClick={() => setOpenId(integration.id)}
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-[var(--s-hover)]
              focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
              {integration.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-[var(--s-fg)]">
                {t(integration.nameKey)}
              </span>
              <span className="block text-[11.5px] leading-[1.45] text-[var(--s-fg-subtle)]">
                {t(integration.descriptionKey)}
              </span>
            </span>
            <span
              className={`shrink-0 whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-medium ${
                enabled
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-[var(--s-line-soft)] text-[var(--s-fg-subtle)]"
              }`}
            >
              {enabled
                ? t("integrations.statusEnabled")
                : t("integrations.statusDisabled")}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--s-fg-subtle)]" />
          </button>
        );
      })}
      <p data-settings-note className="px-4 py-2.5 text-[11.5px] text-[var(--s-fg-subtle)]">
        {t("integrations.comingSoon")}
      </p>
    </SettingsList>
  );
}
