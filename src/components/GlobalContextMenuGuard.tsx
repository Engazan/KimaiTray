import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  isEditableContextTarget,
  showContextMenu,
  textEditingMenu,
} from "./contextMenu";

/** Suppresses the WebView's generic Reload/Inspect menu in every app window. */
export default function GlobalContextMenuGuard() {
  const { t } = useTranslation();

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (isEditableContextTarget(event.target)) {
        void showContextMenu(event, textEditingMenu({
          undo: t("contextMenu.undo"),
          redo: t("contextMenu.redo"),
          cut: t("contextMenu.cut"),
          copy: t("contextMenu.copy"),
          paste: t("contextMenu.paste"),
          selectAll: t("contextMenu.selectAll"),
        }));
        return;
      }
      // Element-specific handlers still receive the bubbling event and open
      // their own menu; preventDefault only removes the WebView fallback.
      event.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu, true);
    return () => document.removeEventListener("contextmenu", onContextMenu, true);
  }, [t]);

  return null;
}
