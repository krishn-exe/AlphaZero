import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { scrollToSection } from '../../utils/scrollToSection';
import './Footer.css';

const Footer = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
          <h2 className="footer-logo">AlphaZero</h2>
          <p className="footer-tagline">
            AI-Based Early Warning & Landslide Risk Monitoring System for Northeast India
          </p>
        </div>

        {/* Quick Links */}
        <div className="footer-section">
          <h4>Quick Links</h4>
          <ul>
            <li><a href="#home" onClick={handleNav('home')}>Home</a></li>
            <li><a href="#report-incident" onClick={handleNav('report-incident')}>Report Incident</a></li>
            <li><a href="#alerts" onClick={handleNav('alerts')}>Subscribe to Alerts</a></li>
            <li><a href="#" onClick={(e) => e.preventDefault()}>Authority Dashboard</a></li>
          </ul>
        </div>

        {/* Emergency Contacts */}
        <div className="footer-section">
          <h4>Emergency Contacts</h4>
          <ul>
            <li>NDMA Helpline: 1078</li>
            <li>State Disaster Helpline: 108</li>
          </ul>
          <p className="footer-emergency-note">
            In case of emergency, contact local authorities immediately. 
            This platform is a monitoring aid, not a replacement for official emergency services.
          </p>
        </div>

        {/* Attribution */}
        <div className="footer-section">
          <h4>Credits</h4>
          <ul className="footer-attribution">
            <li>Icons by <a href="https://www.flaticon.com" target="_blank" rel="noreferrer">Flaticon</a></li>
            {/* Add per-icon attribution lines here as required by license */}
          </ul>
        </div>

      </div>

      {/* Disclaimer */}
      <div className="footer-disclaimer">
        <p>
          Landslide risk predictions are indicative, based on available data, 
          and should not be the sole basis for evacuation decisions.
        </p>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom">
        <p>&copy; 2026 Team AlphaZero — Built for Smart India Hackathon (PS 26001)</p>
      </div>
    </footer>
  );
};

export default Footer;