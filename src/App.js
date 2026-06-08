import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/landingPages/LandingPage';
import MapPage from './pages/Map';
import Search from './pages/search/Search';
import SidePanel from "./components/map/SidePanel";
import { DataProvider } from './assets/DataContext';
import Report from './pages/report/Report';
import Print from './pages/print/Print';
import SharedMapViewPage from './pages/print/SharedMapViewPage';
import MainHeader from './pages/MainHeader';
import Tutorial from './components/ui/Tutorial'; // Import the new Tutorial page
import Updates from './pages/landingPages/Updates';
import Pricing from './pages/landingPages/Pricing';
import Features from './pages/landingPages/Features';
import FAQ from './pages/landingPages/FAQ';
import OnePage from './pages/OnePage'; // Import the OnePage sales document
import { MapProvider } from './pages/MapContext';
import { UserProvider } from './contexts/UserContext'; // Import UserContext
import Login from './components/auth/Login'; // Import Login component
import SignUp from "./components/auth/SignUp";
import SignupSuccess from "./components/auth/SignupSuccess";
import CreateAccountAfterPayment from "./components/auth/CreateAccountAfterPayment";
import ProtectedRoute from './components/auth/ProtectedRoute';
import TierGate from './components/auth/TierGate';
import ResetPassword from "./components/auth/ResetPassword";
import ManageSubscription from "./pages/ManageSubscription";
import AuthGuard from './components/auth/AuthGuard';
import { TutorialWalkthroughProvider } from './contexts/TutorialWalkthroughContext';
import TutorialSpotlight from './components/tutorial/TutorialSpotlight';

import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('intro');  // Default to 'intro'
  console.log("App is re-rendering");

  return (
    <UserProvider> {/* Wrap the app with UserProvider */}
    <Router>
      <MapProvider>
        <TutorialWalkthroughProvider>
        <DataProvider>
          <AuthGuard>
            <div className="app-container">
              <MainHeader activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Always render the map, so it stays in the background */}
              <div className="map-container">
                <MapPage />
              </div>

              <TutorialSpotlight />

              {/* Components that overlay the map */}
              <div className="overlay-container">
                <Routes>
                  <Route path="/" element={<LandingPage onStartClick={() => setActiveTab('map')} />} />
                  <Route path="/map" element={null} />
                  <Route
                    path="/search"
                    element={
                      <ProtectedRoute>
                        <Search onTabChange={setActiveTab} />
                      </ProtectedRoute>
                    }
                  />
                  {/* Reports: Regrid batch — off at launch; see src/pages/report/README.md */}
                  <Route
                    path="/report"
                    element={
                      <ProtectedRoute>
                        <Report />
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
                  <Route path="/view/:shareToken" element={<SharedMapViewPage />} />
                  <Route path="/tour/:shareToken" element={<SharedMapViewPage />} />
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
        </TutorialWalkthroughProvider>
      </MapProvider>
      </Router>
    </UserProvider>
  );
}

export default App;
