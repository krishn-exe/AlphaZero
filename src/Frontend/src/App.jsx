import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar/Navbar.jsx'
import Home from './pages/Home.jsx'
import ReportIncident from './pages/ReportIncident.jsx'
import AdminLogin from './pages/AdminLogin.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import Footer from './components/Footer/Footer.jsx'
import IncidentFeed from './pages/IncidentFeed.jsx';
function App(){
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/report" element={<ReportIncident />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/feed" element={<IncidentFeed />} />
      </Routes>
      <Footer/>
    </>
  )
}

export default App
