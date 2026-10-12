import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next/initReactI18next';
import { fallbackLng, languages, defaultNS } from './i18n.config';
const runsOnServerSide = typeof window === 'undefined';

i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .use(
    resourcesToBackend(async (language: any, namespace: any) => {
      const base = await import(`./locales/${language}/${namespace}.json`);
      // Kaido: our texts live in locales-kaido/<lang>.json and are laid over
      // the upstream file, so translation.json stays untouched and the weekly
      // rebase onto a new Postiz release never conflicts there.
      const kaido =
        namespace === defaultNS
          ? await import(`./locales-kaido/${language}.json`).catch(() => ({}))
          : {};
      return { ...(base.default ?? base), ...(kaido.default ?? kaido) };
    })
  )
  .init({
    supportedLngs: languages,
    fallbackLng,
    lng: undefined,
    fallbackNS: defaultNS,
    defaultNS,
    detection: {
      order: ['cookie', 'header'],
    },
    preload: runsOnServerSide ? languages : [],
  });

export default i18next;
