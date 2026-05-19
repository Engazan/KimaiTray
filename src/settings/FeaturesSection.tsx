import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import {
  Divider,
  FieldGroup,
  SectionDescription,
  SectionTitle,
  Toggle,
} from "./Controls";

interface Props {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export default function FeaturesSection({ settings, update }: Props) {
  const { t } = useTranslation();

  return (
    <div>
      <SectionTitle>{t("featuresSettings.title")}</SectionTitle>
      <SectionDescription>
        {t("featuresSettings.description")}
      </SectionDescription>

      <FieldGroup label={t("featuresSettings.note")} description={t("featuresSettings.noteDescription")} horizontal>
        <Toggle
          checked={settings.featureNote}
          onChange={(v) => update("featureNote", v)}
        />
      </FieldGroup>

      <Divider />

      <FieldGroup label={t("featuresSettings.tags")} description={t("featuresSettings.tagsDescription")} horizontal>
        <Toggle
          checked={settings.featureTags}
          onChange={(v) => update("featureTags", v)}
        />
      </FieldGroup>

      <Divider />

      <FieldGroup label={t("featuresSettings.customerSelect")} description={t("featuresSettings.customerSelectDescription")} horizontal>
        <Toggle
          checked={settings.featureCustomerSelect}
          onChange={(v) => update("featureCustomerSelect", v)}
        />
      </FieldGroup>

      <Divider />

      <FieldGroup label={t("featuresSettings.customStartTime")} description={t("featuresSettings.customStartTimeDescription")} horizontal>
        <Toggle
          checked={settings.featureCustomStartTime}
          onChange={(v) => update("featureCustomStartTime", v)}
        />
      </FieldGroup>
    </div>
  );
}
