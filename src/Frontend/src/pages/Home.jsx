import HeroSlideshow from '../components/HeroSlideshow/HeroSlideshow.jsx'
import Heatmap from '../components/heatmap/heatmap.jsx'
import SubscribeAlert from '../components/SubscribeAlert/SubscribeAlert.jsx'
import InfoMax from '../components/infoMax/infoMax.jsx'
import ReportIncidentCTA from '../components/ReportIncidentCTA.jsx'
import HowItWorks from '../components/howItWorks/HowItWorks.jsx'

function Home() {
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
