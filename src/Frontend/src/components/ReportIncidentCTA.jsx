import { Link } from 'react-router-dom';
import './reportIncidentCTA.css';

// Import the provided graphic
import disasterGraphic from '../assets/images/disaster.png';

function ReportIncidentCTA() {
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

        {/* Right Column: Single Graphic */}
        <div className="report-cta-right">
          <img src={disasterGraphic} alt="Disaster Graphic" className="disaster-graphic" />
        </div>
      </div>
    </div>
  );
}

export default ReportIncidentCTA;
