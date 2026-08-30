function LanguageSelect() {
  return (
    <div className="lang-select-wrapper">
      <select className="navbar-lang-toggle" defaultValue="english">
        <option value="english">English</option>
        <option value="hindi">हिन्दी</option>
        <option value="assamese">অসমীয়া</option>
        <option value="nepali">नेपाली</option>
        <option value="manipuri">মৈতৈলোন্</option>
        <option value="bengali">বাংলা</option>
      </select>
      <span className="material-symbols-outlined lang-select-icon">
        keyboard_arrow_down
      </span>
    </div>
  );
}

export default LanguageSelect;