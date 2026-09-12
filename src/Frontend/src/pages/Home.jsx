import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import HeroSlideshow from '../components/HeroSlideshow/HeroSlideshow.jsx'
import Heatmap from '../components/heatmap/heatmap.jsx'
import SubscribeAlert from '../components/SubscribeAlert/SubscribeAlert.jsx'
import InfoMax from '../components/infoMax/infoMax.jsx'
import ReportIncidentCTA from '../components/ReportIncidentCTA.jsx'
import HowItWorks from '../components/howItWorks/HowItWorks.jsx'
import './Home.css'
function Home() {
  const { t } = useTranslation();

  return (
    <>
      <div id="home">
        <HeroSlideshow />
      </div>

      <div id="info">
        <InfoMax />
      </div>

      <div id="heatmap" className="page-content">
        <Heatmap />
      </div>

      <div id="report-incident">
        <ReportIncidentCTA />
      </div>

      <div className="view-feed-cta">
        <Link to="/feed" className="btn-view-feed">
          {t('home.viewFeed')}
          <span className="material-symbols-outlined">arrow_forward</span>
        </Link>
      </div>

      <div id="alerts">
        <SubscribeAlert />
      </div>

      <div>
        <HowItWorks />
      </div>
    </>
  )
}

export default Home