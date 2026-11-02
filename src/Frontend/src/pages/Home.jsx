import HeroSlideshow from '../components/HeroSlideshow/HeroSlideshow.jsx';
import Heatmap from '../components/heatmap/heatmap.jsx';
import SubscribeAlert from '../components/SubscribeAlert/SubscribeAlert.jsx';
import InfoMax from '../components/infoMax/infoMax.jsx';
import HowItWorks from '../components/howItWorks/HowItWorks.jsx';
import './Home.css';

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

      <div id="alerts">
        <SubscribeAlert />
      </div>

      <div id="about">
        <HowItWorks />
      </div>
    </>
  );
}

export default Home;
