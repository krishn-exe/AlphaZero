import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar/Navbar.jsx'
import Home from './pages/Home.jsx'
import ReportIncident from './pages/ReportIncident.jsx'
import Footer from './components/Footer/Footer.jsx'

function App(){
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/report" element={<ReportIncident />} />
      </Routes>
      <Footer/>
    </>
  )
}

export default App
