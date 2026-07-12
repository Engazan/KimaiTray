export const CATEGORY_ICON_KEYS = [
  "grid",
  "code",
  "chat",
  "document",
  "users",
  "headset",
  "pencil",
  "search",
  "briefcase",
  "calendar",
  "clock",
  "wrench",
  "bug",
  "chart",
  "folder",
  "star",
  "mail",
  "phone",
] as const;

export type CategoryIcon = (typeof CATEGORY_ICON_KEYS)[number];

export const CATEGORY_COLORS = [
  { key: "blue", value: "#3b82f6" },
  { key: "violet", value: "#8b5cf6" },
  { key: "emerald", value: "#10b981" },
  { key: "amber", value: "#f59e0b" },
  { key: "rose", value: "#f43f5e" },
  { key: "cyan", value: "#06b6d4" },
  { key: "orange", value: "#f97316" },
  { key: "slate", value: "#64748b" },
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number]["key"];

const iconSet = new Set<string>(CATEGORY_ICON_KEYS);
const colorSet = new Set<string>(CATEGORY_COLORS.map((color) => color.key));

export function isCategoryIcon(value: unknown): value is CategoryIcon {
  return typeof value === "string" && iconSet.has(value);
}

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === "string" && colorSet.has(value);
}

export function categoryColorValue(color?: CategoryColor): string | undefined {
  return CATEGORY_COLORS.find((option) => option.key === color)?.value;
}

export function CategoryPictogram({
  icon,
  className = "h-4 w-4",
}: {
  icon: CategoryIcon;
  className?: string;
}) {
  const common = {
    className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
  };

  switch (icon) {
    case "code":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 8.25-3.75 3.75 3.75 3.75m7.5-7.5 3.75 3.75-3.75 3.75m-3-10.5-1.5 13.5" /></svg>;
    case "chat":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.142-4.03 7.5-9 7.5a10.2 10.2 0 0 1-3.555-.625L3 20.25l1.6-4.267A6.593 6.593 0 0 1 3 12c0-4.142 4.03-7.5 9-7.5s9 3.358 9 7.5Z" /></svg>;
    case "document":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375H14.25V6.375A3.375 3.375 0 0 0 10.875 3H8.25m0 11.25h7.5m-7.5 3h4.5M10.5 3H5.625A1.125 1.125 0 0 0 4.5 4.125v15.75A1.125 1.125 0 0 0 5.625 21h12.75a1.125 1.125 0 0 0 1.125-1.125v-8.25A8.625 8.625 0 0 0 10.875 3Z" /></svg>;
    case "users":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.742-.479 3 3 0 0 0-4.682-2.72M18 18.72v-.75c0-.856-.231-1.658-.634-2.348M18 18.72v.03m-6 0a9.06 9.06 0 0 1-4.5-1.207M12 18.75v-.75c0-.856-.231-1.658-.634-2.348M7.5 17.543a3 3 0 0 1-4.682-2.72 9.094 9.094 0 0 1 3.742-.479M15 7.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>;
    case "headset":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0 1 15 0v4.125a1.875 1.875 0 0 1-1.875 1.875H15.75v-6h3.75M4.5 12v4.125A1.875 1.875 0 0 0 6.375 18H8.25v-6H4.5Zm11.25 6c0 1.657-1.679 3-3.75 3" /></svg>;
    case "pencil":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.862 4.487Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>;
    case "search":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.35-5.4a6.75 6.75 0 1 1-13.5 0 6.75 6.75 0 0 1 13.5 0Z" /></svg>;
    case "briefcase":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.073a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6.75A2.25 2.25 0 0 1 6 4.5h3.75m4.5 0H18a2.25 2.25 0 0 1 2.25 2.25v4.073M9.75 4.5V3.75A.75.75 0 0 1 10.5 3h3a.75.75 0 0 1 .75.75v.75m6 6.323A12.023 12.023 0 0 1 12 13.5a12.023 12.023 0 0 1-8.25-2.677M10.5 12h3" /></svg>;
    case "calendar":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 9h16.5m-15-4.5h13.5A1.5 1.5 0 0 1 20.25 6v13.5A1.5 1.5 0 0 1 18.75 21H5.25a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5Z" /></svg>;
    case "clock":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
    case "wrench":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21a2.652 2.652 0 0 0 3.75-3.75l-5.83-5.83M11.42 15.17l2.496-3.03a3.937 3.937 0 0 0-5.438-5.438l-3.03 2.496m5.972 5.972-4.655 5.652a2.25 2.25 0 0 1-3.587-2.69l5.3-6.43m6.692-.282-2.496 3.03" /></svg>;
    case "bug":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.5 0 2.75-1.25 2.75-2.75S13.5 7.25 12 7.25 9.25 8.5 9.25 10s1.25 2.75 2.75 2.75Zm0 0v8m-4-6.5-3 1.5m11-1.5 3 1.5M8 10H4.5m11.5 0h3.5M8.75 6.75 6.5 4.5m8.75 2.25 2.25-2.25M8 14.25V15a4 4 0 0 0 8 0v-.75M8.75 6.75A4.96 4.96 0 0 1 12 5.5a4.96 4.96 0 0 1 3.25 1.25" /></svg>;
    case "chart":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v16.5h16.5M7.5 15.75v-3m4.5 3V8.25m4.5 7.5V5.25" /></svg>;
    case "folder":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V6.375A2.625 2.625 0 0 1 4.875 3.75h3.132c.697 0 1.366.277 1.86.77l1.113 1.113c.493.493 1.162.77 1.86.77h6.285a2.625 2.625 0 0 1 2.625 2.625v7.347A2.625 2.625 0 0 1 19.125 19H4.875a2.625 2.625 0 0 1-2.625-2.625V12.75Z" /></svg>;
    case "star":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="m11.48 3.5-2.17 4.397-4.853.705 3.511 3.423-.829 4.833 4.341-2.282 4.34 2.282-.828-4.833 3.511-3.423-4.853-.705L11.48 3.5Z" /></svg>;
    case "mail":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5A2.25 2.25 0 0 1 19.5 19.5h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0-8.613 5.62a2.25 2.25 0 0 1-2.274 0L2.25 6.75" /></svg>;
    case "phone":
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 7.87 6.38 14.25 14.25 14.25h2.125a2.125 2.125 0 0 0 2.125-2.125v-1.294c0-.488-.332-.914-.806-1.033l-4.177-1.044a1.062 1.062 0 0 0-1.08.4l-.917 1.223a1.125 1.125 0 0 1-1.21.385 11.05 11.05 0 0 1-6.572-6.572 1.125 1.125 0 0 1 .385-1.21l1.223-.917c.35-.263.5-.717.4-1.08L6.952 3.556a1.062 1.062 0 0 0-1.033-.806H4.625A2.375 2.375 0 0 0 2.25 5.125V6.75Z" /></svg>;
    default:
      return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h6.75v4.5H4.5v-4.5Zm8.25 0h6.75v4.5h-6.75v-4.5ZM4.5 12.75h6.75v4.5H4.5v-4.5Zm8.25 0h6.75v4.5h-6.75v-4.5Z" /></svg>;
  }
}
