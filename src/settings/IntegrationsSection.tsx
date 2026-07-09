import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { INTEGRATIONS } from "./integrations/registry";
import { SectionDescription } from "./Controls";
import { ChevronRight } from "./icons";

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
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-[12px] text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
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
    <div>
      <SectionDescription>
        {t("integrations.listDescription")}
      </SectionDescription>

      <div className="space-y-2">
        {INTEGRATIONS.map((integration) => {
          const enabled = integration.isEnabled(settings, connectionId);
          return (
            <button
              key={integration.id}
              type="button"
              onClick={() => setOpenId(integration.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-[#181818] dark:hover:bg-gray-800/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-[#202020] dark:text-gray-300">
                {integration.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-gray-800 dark:text-gray-200">
                  {t(integration.nameKey)}
                </span>
                <span className="block truncate text-[11px] text-gray-400 dark:text-gray-500">
                  {t(integration.descriptionKey)}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  enabled
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                }`}
              >
                {enabled
                  ? t("integrations.statusEnabled")
                  : t("integrations.statusDisabled")}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
            </button>
          );
        })}

        <p className="px-1 pt-2 text-[11px] text-gray-400 dark:text-gray-500">
          {t("integrations.comingSoon")}
        </p>
      </div>
    </div>
  );
}
