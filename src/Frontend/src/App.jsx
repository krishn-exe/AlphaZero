// import { useState } from 'react'
// import heroImg from './assets/hero.png'
// import reactLogo from './assets/react.svg'
// import viteLogo from './assets/vite.svg'
// import './App.css'
import Navbar from './components/Navbar/Navbar.jsx'
import HeroSlideshow from './components/HeroSlideshow/HeroSlideshow.jsx'
import Heatmap from './components/heatmap/heatmap.jsx'
import SubscribeAlert from './components/SubscribeAlert/SubscribeAlert.jsx'
import InfoMax from './components/infoMax/infoMax.jsx'


function App(){
  return (
    <>
       <Navbar />
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
    </>
  )
}

export default App
