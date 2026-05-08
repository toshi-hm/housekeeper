import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enAuth from "@/locales/en/auth.json";
import enCalendar from "@/locales/en/calendar.json";
import enCommon from "@/locales/en/common.json";
import enItems from "@/locales/en/items.json";
import enNotifications from "@/locales/en/notifications.json";
import enSettings from "@/locales/en/settings.json";
import enShopping from "@/locales/en/shopping.json";
import enStats from "@/locales/en/stats.json";
import jaAuth from "@/locales/ja/auth.json";
import jaCalendar from "@/locales/ja/calendar.json";
import jaCommon from "@/locales/ja/common.json";
import jaItems from "@/locales/ja/items.json";
import jaNotifications from "@/locales/ja/notifications.json";
import jaSettings from "@/locales/ja/settings.json";
import jaShopping from "@/locales/ja/shopping.json";
import jaStats from "@/locales/ja/stats.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "ja",
    supportedLngs: ["ja", "en"],
    ns: ["common", "items", "auth", "settings", "shopping", "stats", "notifications", "calendar"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    resources: {
      ja: {
        common: jaCommon,
        items: jaItems,
        auth: jaAuth,
        settings: jaSettings,
        shopping: jaShopping,
        stats: jaStats,
        notifications: jaNotifications,
        calendar: jaCalendar,
      },
      en: {
        common: enCommon,
        items: enItems,
        auth: enAuth,
        settings: enSettings,
        shopping: enShopping,
        stats: enStats,
        notifications: enNotifications,
        calendar: enCalendar,
      },
    },
  });

export default i18n;
