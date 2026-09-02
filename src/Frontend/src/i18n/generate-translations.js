// One-time script to auto-generate translation JSON files using MyMemory API.
// Run with: node generate-translations.js
// Requires internet access. Review output before shipping — MT quality varies,
// especially for Assamese/Nepali.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
// Optional: add your email to raise the free daily cap from 5,000 to 10,000 words
const CONTACT_EMAIL = ''; // e.g. 'yourname@example.com' — leave blank if you don't want this

const LANGUAGES = {
  hindi: 'hi',
  assamese: 'as',
  nepali: 'ne',
  bengali: 'bn',
  // manipuri skipped for now — no reliable free MT coverage
};

const englishPath = path.join(__dirname, 'locales', 'english.json');
const english = JSON.parse(fs.readFileSync(englishPath, 'utf-8'));

function flatten(obj, prefix = '') {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      Object.assign(acc, flatten(value, newKey));
    } else {
      acc[newKey] = value;
    }
    return acc;
  }, {});
}

function unflatten(flat) {
  const result = {};
  for (const [key, value] of Object.entries(flat)) {
    const keys = key.split('.');
    let curr = result;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) {
        curr[k] = value;
      } else {
        curr[k] = curr[k] || {};
        curr = curr[k];
      }
    });
  }
  return result;
}

async function translateText(text, targetLang) {
  const params = new URLSearchParams({
    q: text,
    langpair: `en|${targetLang}`,
  });
  if (CONTACT_EMAIL) params.append('de', CONTACT_EMAIL);

  const response = await fetch(`${MYMEMORY_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  // MyMemory sometimes returns 200 OK but with an error status inside the body
  if (data.responseStatus && Number(data.responseStatus) !== 200) {
    throw new Error(`API status ${data.responseStatus}: ${data.responseDetails || 'unknown error'}`);
  }

  return data.responseData.translatedText;
}

async function generateLanguageFile(langName, langCode) {
  console.log(`\nTranslating to ${langName} (${langCode})...`);
  const flatEnglish = flatten(english);
  const flatTranslated = {};

  for (const [key, text] of Object.entries(flatEnglish)) {
    try {
      const translated = await translateText(text, langCode);
      flatTranslated[key] = translated;
      console.log(`  ${key}: "${text}" -> "${translated}"`);
    } catch (err) {
      console.error(`  FAILED on ${key}: ${err.message}`);
      flatTranslated[key] = text; // fallback to English so nothing breaks
    }
    // Small delay to be polite to the free API
    await new Promise((r) => setTimeout(r, 400));
  }

  const nested = unflatten(flatTranslated);
  const outPath = path.join(__dirname, 'locales', `${langName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(nested, null, 2), 'utf-8');
  console.log(`Saved ${outPath}`);
}

async function main() {
  for (const [langName, langCode] of Object.entries(LANGUAGES)) {
    await generateLanguageFile(langName, langCode);
  }
  console.log('\nDone. Please review each file with a native/fluent speaker before shipping.');
  console.log('Manipuri was skipped — create manipuri.json by hand or come back to it later.');
}

main();