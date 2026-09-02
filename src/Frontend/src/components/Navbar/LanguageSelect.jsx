import { useTranslation } from 'react-i18next';

function LanguageSelect() {
  const { i18n } = useTranslation();

  const handleChange = (e) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
    localStorage.setItem('alphazero-lang', lang);
  };

  return (
    <div className="lang-select-wrapper">
      <select className="navbar-lang-toggle" value={i18n.language} onChange={handleChange}>
        <option value="english">English</option>
        <option value="hindi">हिन्दी</option>
        <option value="assamese">অসমীয়া</option>
        <option value="nepali">नेपाली</option>
        <option value="bengali">বাংলা</option>
      </select>
      <span className="material-symbols-outlined lang-select-icon">
        keyboard_arrow_down
      </span>
    </div>
  );
}

export default LanguageSelect;