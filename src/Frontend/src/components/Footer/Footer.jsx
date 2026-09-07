import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { scrollToSection } from '../../utils/scrollToSection';
import './Footer.css';

const Footer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const handleNav = (sectionId) => (e) => {
    e.preventDefault();
    navigate('/');
    scrollToSection(sectionId, navigate, location);
  };

  return (
    <footer className="footer">
      <div className="footer-container">

        {/* Brand */}
        <div className="footer-brand">
          <h2 className="footer-logo">Bhu Rakshak</h2>
          <p className="footer-tagline">{t('footer.tagline')}</p>
        </div>

        {/* Quick Links */}
        <div className="footer-section">
          <h4>{t('footer.quickLinks')}</h4>
          <ul>
            <li><a href="#home" onClick={handleNav('home')}>{t('nav.home')}</a></li>
            <li><a href="#report-incident" onClick={handleNav('report-incident')}>{t('nav.reportIncident')}</a></li>
            <li><a href="#alerts" onClick={handleNav('alerts')}>{t('nav.alerts')}</a></li>
            <li><a href="#" onClick={(e) => e.preventDefault()}>{t('footer.authorityDashboard')}</a></li>
          </ul>
        </div>

        {/* Emergency Contacts */}
        <div className="footer-section">
          <h4>{t('footer.emergencyContacts')}</h4>
          <ul>
            <li>NDMA Helpline: 1078</li>
            <li>State Disaster Helpline: 108</li>
          </ul>
          <p className="footer-emergency-note">{t('footer.emergencyNote')}</p>
        </div>

        {/* Attribution */}
        <div className="footer-section">
          <h4>{t('footer.credits')}</h4>
          <ul className="footer-attribution">
            <li>Icons by <a href="https://www.flaticon.com" target="_blank" rel="noreferrer">Flaticon</a></li>
            {/* Add per-icon attribution lines here as required by license */}
          </ul>
        </div>

      </div>

      {/* Disclaimer */}
      <div className="footer-disclaimer">
        <p>{t('footer.disclaimer')}</p>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom">
        <p>&copy; 2026 Team Zenith — Built for Smart India Hackathon (PS 26001)</p>
      </div>
    </footer>
  );
};

export default Footer;