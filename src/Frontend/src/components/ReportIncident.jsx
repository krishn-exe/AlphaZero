import { Link } from 'react-router-dom';
import './reportIncident.css';

// Import the provided icons
import floodingIcon from '../assets/icons/flooding.png';
import treeIcon from '../assets/icons/tree.png';
import landslideIcon from '../assets/icons/landslide.png';

function ReportIncident() {
  return (
    <div className="report-cta-container">
      <div className="report-cta-layout">
        {/* Left Column */}
        <div className="report-cta-left">
          <div className="citizen-badge">
            <span className="material-symbols-outlined badge-icon">warning</span>
            CITIZEN REPORTING
          </div>
          
          <h2 className="report-cta-title">
            Help Protect<br />
            Your<br />
            Community
          </h2>
          
          <p className="report-cta-desc">
            Spotted a hazard? Your reports help our AI and authorities respond faster to landslides, road damage, and flooding.
          </p>
          
          <Link to="/report" className="btn-report-action">
            REPORT AN INCIDENT
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>

        {/* Right Column: Grid */}
        <div className="report-cta-right">
          
          <div className="hazard-card">
            <div className="hazard-icon-box">
              <img src={landslideIcon} alt="Active Landslide" className="hazard-icon-img" />
            </div>
            <div className="hazard-info">
              <h3>Active Landslide</h3>
              <p>Report fresh soil movement, rockfalls, or unstable slopes.</p>
            </div>
          </div>

          <div className="hazard-card">
            <div className="hazard-icon-box">
              {/* Fallback to material icon for Road Damage if icon is missing from uploads */}
              <span className="material-symbols-outlined" style={{ color: '#22c55e', fontSize: '24px' }}>edit_road</span>
            </div>
            <div className="hazard-info">
              <h3>Road Damage</h3>
              <p>Identify structural cracks, sinkholes, or blocked pathways.</p>
            </div>
          </div>

          <div className="hazard-card">
            <div className="hazard-icon-box">
              <img src={floodingIcon} alt="Heavy Flooding" className="hazard-icon-img" />
            </div>
            <div className="hazard-info">
              <h3>Heavy Flooding</h3>
              <p>Alert authorities about rising water levels and washed-out areas.</p>
            </div>
          </div>

          <div className="hazard-card">
            <div className="hazard-icon-box">
              <img src={treeIcon} alt="Fallen Trees" className="hazard-icon-img" />
            </div>
            <div className="hazard-info">
              <h3>Fallen Trees</h3>
              <p>Report uprooted trees blocking critical infrastructure or roads.</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default ReportIncident;
