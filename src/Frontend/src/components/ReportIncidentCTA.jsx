import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './reportIncidentCTA.css';

import disasterGraphic from '../assets/images/disaster.png';

function ReportIncidentCTA() {
  const { t } = useTranslation();

  return (
    <div className="report-cta-container">
      <div className="report-cta-layout">
        <div className="report-cta-left">
          <div className="citizen-badge">
            <span className="material-symbols-outlined badge-icon">warning</span>
            {t('reportCta.badge')}
          </div>

          <h2 className="report-cta-title">
            {t('reportCta.title')}
          </h2>

          <p className="report-cta-desc">
            {t('reportCta.description')}
          </p>

          <Link to="/report" className="btn-report-action">
            {t('reportCta.button')}
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>

        <div className="report-cta-right">
          <img src={disasterGraphic} alt="Disaster Graphic" className="disaster-graphic" />
        </div>
      </div>
    </div>
  );
}

export default ReportIncidentCTA;