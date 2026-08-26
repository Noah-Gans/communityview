import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from './pages/landingPages/LandingPage';
import MapPage from './pages/Map';
import Search from './pages/search/Search';
import { DataProvider } from './assets/DataContext';
import Report from './pages/report/Report';
import Print from './pages/print/Print';
import SharedMapViewPage from './pages/print/SharedMapViewPage';
import AmenityMapPage from './pages/print/AmenityMapPage';
import PlanningBuildabilityPage from './pages/planning/PlanningBuildabilityPage';
import MainHeader from './pages/MainHeader';
import Pricing from './pages/landingPages/Pricing';
import Features from './pages/landingPages/Features';
import FAQ from './pages/landingPages/FAQ';
import UseCases from './pages/landingPages/UseCases';
import UseCasePage from './pages/landingPages/UseCasePage';
import CompareLandId from './pages/landingPages/CompareLandId';
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
import MobileTopBar from './components/map/MobileTopBar';
import { isMapBackedRoute } from './utils/mapBackedRoutes';
import SeoManager from './seo/SeoManager';
import { faqItems } from './pages/landingPages/content/faq';

import './App.css';

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
};

const JSON_LD_BY_PATH = {
  '/faq': FAQ_JSON_LD,
};

function AppRoutes({ activeTab, setActiveTab }) {
  const location = useLocation();
  const showMap = isMapBackedRoute(location.pathname);

  return (
    <div className="app-container">
      <SeoManager jsonLdByPath={JSON_LD_BY_PATH} />
      <MainHeader activeTab={activeTab} onTabChange={setActiveTab} />
      <MobileTopBar />

      {showMap && (
        <div className="map-container">
          <MapPage />
        </div>
      )}

      <TutorialSpotlight />

      <div className="overlay-container">
        <Routes>
                  <Route path="/" element={<LandingPage onStartClick={() => setActiveTab('map')} />} />
                  <Route path="/map" element={null} />
                  <Route path="/planning" element={<PlanningBuildabilityPage />} />
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
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/features" element={<Features />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/use-cases" element={<UseCases />} />
                  <Route path="/use-cases/:slug" element={<UseCasePage />} />
                  <Route path="/compare/land-id" element={<CompareLandId />} />
                  <Route path="/compare/landid" element={<CompareLandId />} />
                  <Route path="/view/:shareToken" element={<SharedMapViewPage />} />
                  <Route path="/tour/:shareToken" element={<SharedMapViewPage />} />
                  <Route path="/amenities/:shareToken" element={<AmenityMapPage />} />
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
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('intro');  // Default to 'intro'
  console.log("App is re-rendering");

  return (
    <UserProvider>
      <Router>
        <MapProvider>
          <TutorialWalkthroughProvider>
            <DataProvider>
              <AuthGuard>
                <AppRoutes activeTab={activeTab} setActiveTab={setActiveTab} />
              </AuthGuard>
            </DataProvider>
          </TutorialWalkthroughProvider>
        </MapProvider>
      </Router>
    </UserProvider>
  );
}

export default App;
