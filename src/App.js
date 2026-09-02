import React, { lazy, Suspense, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { DataProvider } from './assets/DataContext';
import { MapProvider } from './pages/MapContext';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import TierGate from './components/auth/TierGate';
import AuthGuard from './components/auth/AuthGuard';
import { TutorialWalkthroughProvider } from './contexts/TutorialWalkthroughContext';
import MapLoadingOverlay from './components/loading/MapLoadingOverlay';
import { isMapBackedRoute, isPublicShareRoute, normalizePathname } from './utils/mapBackedRoutes';
import SeoManager from './seo/SeoManager';
import { faqItems } from './pages/landingPages/content/faq';

import './App.css';

const MapPage = lazy(() => import('./pages/Map'));
const SharedMapViewPage = lazy(() => import('./pages/print/SharedMapViewPage'));
const AmenityMapPage = lazy(() => import('./pages/print/AmenityMapPage'));
const MainHeader = lazy(() => import('./pages/MainHeader'));
const MobileTopBar = lazy(() => import('./components/map/MobileTopBar'));
const TutorialSpotlight = lazy(() => import('./components/tutorial/TutorialSpotlight'));
const LandingPage = lazy(() => import('./pages/landingPages/LandingPage'));
const Search = lazy(() => import('./pages/search/Search'));
const Report = lazy(() => import('./pages/report/Report'));
const Print = lazy(() => import('./pages/print/Print'));
const Pricing = lazy(() => import('./pages/landingPages/Pricing'));
const Features = lazy(() => import('./pages/landingPages/Features'));
const FAQ = lazy(() => import('./pages/landingPages/FAQ'));
const UseCases = lazy(() => import('./pages/landingPages/UseCases'));
const UseCasePage = lazy(() => import('./pages/landingPages/UseCasePage'));
const CompareLandId = lazy(() => import('./pages/landingPages/CompareLandId'));
const OnePage = lazy(() => import('./pages/OnePage'));
const Login = lazy(() => import('./components/auth/Login'));
const SignUp = lazy(() => import('./components/auth/SignUp'));
const SignupSuccess = lazy(() => import('./components/auth/SignupSuccess'));
const CreateAccountAfterPayment = lazy(() => import('./components/auth/CreateAccountAfterPayment'));
const ResetPassword = lazy(() => import('./components/auth/ResetPassword'));
const ManageSubscription = lazy(() => import('./pages/ManageSubscription'));

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

function routeFallbackPhraseSet(pathname) {
  const path = normalizePathname(pathname);
  if (path.startsWith('/tour/')) return 'tour';
  if (path.startsWith('/amenities/')) return 'amenities';
  if (isMapBackedRoute(path)) return 'map';
  return 'site';
}

function RouteFallback({ pathname }) {
  return (
    <MapLoadingOverlay
      phraseSet={routeFallbackPhraseSet(pathname)}
      className="map-loading-overlay--app-boot"
    />
  );
}

function AppRoutes({ activeTab, setActiveTab }) {
  const location = useLocation();
  const showMap = isMapBackedRoute(location.pathname);
  const isShare = isPublicShareRoute(location.pathname);

  return (
    <div className="app-container">
      <SeoManager jsonLdByPath={JSON_LD_BY_PATH} />
      {!isShare && (
        <Suspense fallback={null}>
          <MainHeader activeTab={activeTab} onTabChange={setActiveTab} />
          <MobileTopBar />
          <TutorialSpotlight />
        </Suspense>
      )}

      {showMap && (
        <div className="map-container">
          <Suspense fallback={<RouteFallback pathname={location.pathname} />}>
            <MapPage />
          </Suspense>
        </div>
      )}

      <div className="overlay-container">
        <Suspense fallback={showMap ? null : <RouteFallback pathname={location.pathname} />}>
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
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/signup-success" element={<SignupSuccess />} />
            <Route path="/create-account" element={<CreateAccountAfterPayment />} />
            <Route
              path="/manage-subscription"
              element={
                <ProtectedRoute>
                  <ManageSubscription />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('intro');
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
