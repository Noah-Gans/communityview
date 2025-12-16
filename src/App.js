import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Intro from './pages/Intro';
import Map from './pages/Mapy';
import Search from './pages/Search';
import SidePanel from "./components/SidePanel";
import { DataProvider } from './assets/DataContext';
import Report from './pages/Report';
import Print from './pages/Print';
import MainHeader from './pages/MainHeader';
import Tutorial from './components/Tutorial'; // Import the new Tutorial page
import Updates from './pages/Updates'; // Import the new Updates page
import Pricing from './pages/Pricing'; // Import the new Pricing page
import Features from './pages/Features'; // Import the new Features page
import FAQ from './pages/FAQ'; // Import the new FAQ page
import OnePage from './pages/OnePage'; // Import the OnePage sales document
import { MapProvider } from './pages/MapContext';
import { UserProvider } from './contexts/UserContext'; // Import UserContext
import Login from './components/Login'; // Import Login component
import SignUp from "./components/SignUp";
import SignupSuccess from "./components/SignupSuccess";
import CreateAccountAfterPayment from "./components/CreateAccountAfterPayment";
import ProtectedRoute from './components/ProtectedRoute';
import TierGate from './components/TierGate';
import ResetPassword from "./components/ResetPassword";
import ManageSubscription from "./pages/ManageSubscription";
import AuthGuard from './components/AuthGuard';

import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('intro');  // Default to 'intro'
  console.log("App is re-rendering");

  return (
    <UserProvider> {/* Wrap the app with UserProvider */}
    <Router>
      <MapProvider>
        <DataProvider>
          <AuthGuard>
            <div className="app-container">
              <MainHeader activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Always render the map, so it stays in the background */}
              <div className="map-container">
                <Map />
              </div>

              {/* Components that overlay the map */}
              <div className="overlay-container">
                <Routes>
                  <Route path="/" element={<Intro onStartClick={() => setActiveTab('map')} />} />
                  <Route path="/map" element={null} />
                  <Route
                    path="/search"
                    element={
                      <ProtectedRoute>
                        <Search onTabChange={setActiveTab} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/report"
                    element={
                      <ProtectedRoute>
                        <TierGate requiredTier="plus">
                          <Report />
                        </TierGate>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/print"
                    element={
                      <ProtectedRoute>
                        <TierGate requiredTier="plus">
                          <Print />
                        </TierGate>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/tutorial" element={<Tutorial />} />
                  <Route path="/updates" element={<Updates />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/features" element={<Features />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/onepage" element={<OnePage />} />
                  <Route path="/login" element={<Login />} /> {/* Add Login Route */}
                  <Route path="/reset-password" element={<ResetPassword />} /> {/* Add Reset Password Route */}
                  <Route path="/signup" element={<SignUp />} />
                  <Route path="/signup-success" element={<SignupSuccess />} />
                  <Route path="/create-account" element={<CreateAccountAfterPayment />} />
                  <Route path="/manage-subscription" element={
                    <ProtectedRoute>
                      <ManageSubscription />
                    </ProtectedRoute>
                  } />
                </Routes>
              </div>
            </div>
          </AuthGuard>
        </DataProvider>
      </MapProvider>
      </Router>
    </UserProvider>
  );
}

export default App;
