export interface NotificationLocale {
  code: string;
  label: string;
  notificationTitle: string;
  notificationBody: string;
}

export const NOTIFICATION_LOCALES: NotificationLocale[] = [
  {
    code: "en",
    label: "English",
    notificationTitle: "Urban Explorer is exploring with you",
    notificationBody: "Listening for nearby places to narrate as you walk.",
  },
  {
    code: "es",
    label: "Español",
    notificationTitle: "Urban Explorer está explorando contigo",
    notificationBody: "Escuchando lugares cercanos para narrar mientras caminas.",
  },
  {
    code: "fr",
    label: "Français",
    notificationTitle: "Urban Explorer explore avec vous",
    notificationBody: "À l'écoute des lieux proches à raconter pendant votre marche.",
  },
  {
    code: "de",
    label: "Deutsch",
    notificationTitle: "Urban Explorer entdeckt mit dir",
    notificationBody: "Hört auf Orte in der Nähe, um sie beim Gehen zu erzählen.",
  },
  {
    code: "it",
    label: "Italiano",
    notificationTitle: "Urban Explorer sta esplorando con te",
    notificationBody: "In ascolto dei luoghi vicini da raccontare mentre cammini.",
  },
  {
    code: "pt",
    label: "Português",
    notificationTitle: "Urban Explorer está explorando com você",
    notificationBody: "Ouvindo lugares próximos para narrar enquanto você caminha.",
  },
  {
    code: "nl",
    label: "Nederlands",
    notificationTitle: "Urban Explorer verkent met je mee",
    notificationBody: "Luistert naar plekken in de buurt om te vertellen terwijl je loopt.",
  },
  {
    code: "ja",
    label: "日本語",
    notificationTitle: "Urban Explorer があなたと一緒に探索中",
    notificationBody: "歩きながら案内できる近くの場所を探しています。",
  },
  {
    code: "ko",
    label: "한국어",
    notificationTitle: "Urban Explorer가 함께 탐험하고 있어요",
    notificationBody: "걷는 동안 안내할 주변 장소를 찾고 있습니다.",
  },
  {
    code: "zh",
    label: "中文",
    notificationTitle: "Urban Explorer 正在与你一起探索",
    notificationBody: "正在搜寻附近可讲解的地点。",
  },
];

export const DEFAULT_NOTIFICATION_LOCALE = "en";

export function getNotificationLocale(code: string): NotificationLocale {
  return (
    NOTIFICATION_LOCALES.find((l) => l.code === code) ??
    NOTIFICATION_LOCALES.find((l) => l.code === DEFAULT_NOTIFICATION_LOCALE)!
  );
}
