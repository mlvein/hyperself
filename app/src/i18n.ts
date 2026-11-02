// i18n phase 1: UI chrome only. User entries are never translated and
// never leave the device for translation; synthesis prompts stay in
// English for now (the Settings language note says so, in both locales).
export type Locale = 'en' | 'es';

export const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

const LOCALE_KEY = 'hyperself.locale.v1';

export const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    'nav.knowledge': 'Knowledgebase',
    'nav.paths': 'Paths',
    'nav.legacy': 'Legacy',
    'nav.settings': 'Settings',
    'sub.synthesis': 'Synthesis',
    'sub.network': 'Network',
    'sub.import': 'Import & Connect',
    'sub.security': 'Security',
    'sub.insights': 'Insights',
    'sub.templates': 'Templates',
    'sub.history': 'History',
    'sub.export': 'Export',
    'search.button': 'Search',
    'search.knowledge': 'Ask your knowledgebase…',
    'search.network': 'Search people in your network…',
    'search.paths': 'Search insights and Paths — or ask your knowledgebase…',
    'search.legacy': 'Ask your knowledgebase…',
    'settings.model': 'Local model — on this device',
    'settings.privacy': 'Privacy & your data',
    'settings.language': 'Language',
    'settings.languageLabel': 'Interface language',
    'settings.languageNote':
      'Choose the interface language. Your entries are never translated or sent anywhere, and synthesis prompts stay in English for now.',
    'settings.openSecurity': 'Open Security',
    'settings.openLegacy': 'Export, packs & backup',
    'synth.model': 'Local model:',
    'synth.change': 'Change in Settings',
  },
  es: {
    'nav.knowledge': 'Base de conocimiento',
    'nav.paths': 'Rutas',
    'nav.legacy': 'Legado',
    'nav.settings': 'Ajustes',
    'sub.synthesis': 'Síntesis',
    'sub.network': 'Red',
    'sub.import': 'Importar y conectar',
    'sub.security': 'Seguridad',
    'sub.insights': 'Perspectivas',
    'sub.templates': 'Plantillas',
    'sub.history': 'Historial',
    'sub.export': 'Exportar',
    'search.button': 'Buscar',
    'search.knowledge': 'Pregunta a tu base de conocimiento…',
    'search.network': 'Busca personas en tu red…',
    'search.paths': 'Busca en Perspectivas y Rutas — o pregunta a tu base de conocimiento…',
    'search.legacy': 'Pregunta a tu base de conocimiento…',
    'settings.model': 'Modelo local — en este dispositivo',
    'settings.privacy': 'Privacidad y tus datos',
    'settings.language': 'Idioma',
    'settings.languageLabel': 'Idioma de la interfaz',
    'settings.languageNote':
      'Elige el idioma de la interfaz. Tus entradas nunca se traducen ni se envían a ningún sitio, y las indicaciones de síntesis permanecen en inglés por ahora.',
    'settings.openSecurity': 'Abrir Seguridad',
    'settings.openLegacy': 'Exportar, paquetes y copia de seguridad',
    'synth.model': 'Modelo local:',
    'synth.change': 'Cambiar en Ajustes',
  },
};

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es';
}

/** Translate a chrome key; unknown locales/keys fall back to English. */
export function t(locale: string, key: string): string {
  const table = isLocale(locale) ? STRINGS[locale] : STRINGS.en;
  return table[key] ?? STRINGS.en[key] ?? key;
}

export function loadLocale(): Locale {
  try {
    if (typeof localStorage === 'undefined') return 'en';
    const raw = localStorage.getItem(LOCALE_KEY);
    return isLocale(raw) ? raw : 'en';
  } catch {
    return 'en';
  }
}

export function saveLocale(locale: Locale): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Storage unavailable: the choice applies to this session only.
  }
}

/** Locale-format a date via Intl; unparseable input passes through. */
export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(isLocale(locale) ? locale : 'en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

/** Apply a locale to every tagged chrome string and the document lang. */
export function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = (node as HTMLElement).dataset.i18n;
    if (key) node.textContent = t(locale, key);
  });
  const select = document.getElementById('languageSelect') as HTMLSelectElement | null;
  if (select) select.value = locale;
}
