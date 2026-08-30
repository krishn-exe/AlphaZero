import { useState } from 'react';
import './Navbar.css';
import NavMenuContent from './NavMenuContent';

function Navbar() {
  const [activeSection, setActiveSection] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  const navItems = [
    { id: 'home', label: 'home' },
    { id: 'heatmap', label: 'heatmap' },
    { id: 'alerts', label: 'alerts' },
    { id: 'about', label: 'about' },
  ];

  return (
    <>
      <nav className="navbar">
        <div className="navbar-logo">
          <span className="navbar-brand">AlphaZero</span>
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

      {/* Mobile menu rendered OUTSIDE <nav>, directly under it in the DOM */}
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