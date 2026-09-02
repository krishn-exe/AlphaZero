import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import english from './locales/english.json';
import hindi from './locales/hindi.json';
import assamese from './locales/assamese.json';
import nepali from './locales/nepali.json';
import bengali from './locales/bengali.json';
// manipuri skipped for now — add back once translated

i18n.use(initReactI18next).init({
  resources: {
    english: { translation: english },
    hindi: { translation: hindi },
    assamese: { translation: assamese },
    nepali: { translation: nepali },
    bengali: { translation: bengali },
  },
  lng: localStorage.getItem('alphazero-lang') || 'english',
  fallbackLng: 'english',
  interpolation: { escapeValue: false },
});

export default i18n;