import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import sk from "./locales/sk.json";
import cs from "./locales/cs.json";
import de from "./locales/de.json";
import uk from "./locales/uk.json";
import es from "./locales/es.json";
import { loadSettings } from "../../settings/service";

export const SUPPORTED_LANGUAGES = ["sk", "en", "cs", "de", "uk", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguageSetting = SupportedLanguage | "system";

export function resolveSystemLanguage(): SupportedLanguage {
  const raw = navigator.language ?? "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("sk")) return "sk";
  if (lower.startsWith("cs") || lower.startsWith("cz")) return "cs";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("uk") || lower.startsWith("ua")) return "uk";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("en")) return "en";
  return "en";
}

export function resolveLanguage(setting: LanguageSetting): SupportedLanguage {
  if (setting === "system") return resolveSystemLanguage();
  return setting;
}

async function getInitialLanguage(): Promise<SupportedLanguage> {
  try {
    const settings = await loadSettings();
    if (settings.language) return resolveLanguage(settings.language);
  } catch {
    // Settings unavailable at startup
  }
  return resolveSystemLanguage();
}

const initPromise = getInitialLanguage().then((lng) =>
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      sk: { translation: sk },
      cs: { translation: cs },
      de: { translation: de },
      uk: { translation: uk },
      es: { translation: es },
    },
    lng,
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES],
    interpolation: { escapeValue: false },
  }),
);

export { initPromise };
export default i18n;
