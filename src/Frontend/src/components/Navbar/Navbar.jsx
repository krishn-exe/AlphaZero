import { useState } from 'react';
import './Navbar.css';

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

          <select className="navbar-lang-toggle" defaultValue="english">
            <option value="english">english</option>
            <option value="hindi">हिन्दी</option>
            <option value="assamese">অসমীয়া</option>
            <option value="nepali">नेपाली</option>
            <option value="manipuri">মৈতৈলোন্</option>
            <option value="bengali">বাংলা</option>
          </select>

          <button className="navbar-bell" aria-label="notifications">
            🔔
          </button>

          <button className="navbar-admin-login">admin login</button>
        </div>
      </nav>

      {/* Mobile menu rendered OUTSIDE <nav>, directly under it in the DOM */}
      {menuOpen && (
        <div className="mobile-menu">
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

          <select className="navbar-lang-toggle" defaultValue="english">
            <option value="english">english</option>
            <option value="hindi">हिन्दी</option>
            <option value="assamese">অসমীয়া</option>
            <option value="nepali">नेपाली</option>
            <option value="manipuri">মৈতৈলোন্</option>
            <option value="bengali">বাংলা</option>
          </select>

          <button className="navbar-bell" aria-label="notifications">
            🔔
          </button>

          <button className="navbar-admin-login">admin login</button>
        </div>
      )}
    </>
  );
}

export default Navbar;