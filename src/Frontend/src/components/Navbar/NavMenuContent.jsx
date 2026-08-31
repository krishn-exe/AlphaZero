import LanguageSelect from './LanguageSelect';
import { useNavigate } from 'react-router-dom';

function NavMenuContent({ navItems, activeSection, scrollToSection }) {
  const navigate = useNavigate();

  return (
    <>
      <ul className="navbar-links">
        {navItems.map((item) => (
          <li className="navbar-item" key={item.id}>
            <button
              className={`navbar-link ${activeSection === item.id ? 'navbar-link-active' : ''}`}
              onClick={() => scrollToSection(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <LanguageSelect />
<button className="navbar-bell" aria-label="notifications">
  <span className="material-symbols-outlined">notifications_active</span>
</button>

      <button className="navbar-admin-login" onClick={() => navigate('/admin/login')}>Admin login</button>
    </>
  );
}

export default NavMenuContent;