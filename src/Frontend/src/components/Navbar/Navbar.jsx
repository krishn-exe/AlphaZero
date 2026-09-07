import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Navbar.css';
import NavMenuContent from './NavMenuContent';
import { scrollToSection as scrollToSectionUtil } from '../../utils/scrollToSection';

function Navbar() {
  const [activeSection, setActiveSection] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);
    scrollToSectionUtil(sectionId, navigate, location);
    setMenuOpen(false);
  };

  const navItems = [
    { id: 'home', labelKey: 'nav.home' },
    { id: 'report-incident', labelKey: 'nav.reportIncident' },
    { id: 'alerts', labelKey: 'nav.alerts' },
    { id: 'about', labelKey: 'nav.about' },
  ];

  return (
    <>
      <nav className="navbar">
        <div className="navbar-logo" onClick={() => { navigate('/'); scrollToSection('home'); }} style={{ cursor: 'pointer' }}>
          <span className="navbar-brand">Bhu Rakshak</span>
        </div>

        <button
          className="navbar-hamburger"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span className={`hamburger-bar ${menuOpen ? 'bar-open-1' : ''}`}></span>
          <span className={`hamburger-bar ${menuOpen ? 'bar-open-2' : ''}`}></span>
          <span className={`hamburger-bar ${menuOpen ? 'bar-open-3' : ''}`}></span>
        </button>

        <div className="navbar-right navbar-right-desktop">
          <NavMenuContent
            navItems={navItems}
            activeSection={activeSection}
            scrollToSection={scrollToSection}
          />
        </div>
      </nav>

      {menuOpen && (
        <div className="mobile-menu">
          <NavMenuContent
            navItems={navItems}
            activeSection={activeSection}
            scrollToSection={scrollToSection}
          />
        </div>
      )}
    </>
  );
}

export default Navbar;