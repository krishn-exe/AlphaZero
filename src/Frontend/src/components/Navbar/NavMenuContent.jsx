import LanguageSelect from './LanguageSelect';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function NavMenuContent({ navItems, activeSection, scrollToSection }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <>
      <ul className="navbar-links">
        {navItems.map((item) => (
          <li className="navbar-item" key={item.id}>
            <button
              className={`navbar-link ${activeSection === item.id ? 'navbar-link-active' : ''}`}
              onClick={() => scrollToSection(item.id)}
            >
              {t(item.labelKey)}
            </button>
          </li>
        ))}
      </ul>

      <LanguageSelect />
      <button className="navbar-bell" aria-label="notifications">
        <span className="material-symbols-outlined">notifications_active</span>
      </button>

      <button className="navbar-admin-login" onClick={() => navigate('/admin/login')}>
        {t('nav.adminLogin')}
      </button>
    </>
  );
}

export default NavMenuContent;