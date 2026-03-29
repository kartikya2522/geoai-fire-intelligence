import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import './styles/glassmorphism.css';
import Landing   from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Map       from './pages/Map';
import History from './pages/History';
import RiskPortal from './pages/RiskPortal';

function Nav() {
  return (
    <nav className="nav">
      <NavLink to="/" className="nav-brand">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 2C11 2 5 8 5 13a6 6 0 0012 0c0-5-6-11-6-11z"
            fill="var(--ember-500)" opacity="0.9"/>
          <path d="M11 8c0 0-3 3.5-3 5.5a3 3 0 006 0C14 11.5 11 8 11 8z"
            fill="var(--ember-300)" opacity="0.7"/>
        </svg>
        GeoAI <span>Fire</span>
      </NavLink>

      <div className="nav-links">
        <NavLink to="/"          className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>Overview</NavLink>
        <NavLink to="/dashboard" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>Predict</NavLink>
        <NavLink to="/map"       className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>Map</NavLink>
        <NavLink to="/analytics" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>Analytics</NavLink>
        <NavLink to="/history" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>History</NavLink>
        <NavLink to="/risk" className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>Risk Portal</NavLink>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/"          element={<Landing />}   />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/map"       element={<Map />}       />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/history" element={<History />} />
        <Route path="/risk" element={<RiskPortal />} />
      </Routes>
    </BrowserRouter>
  );
}
