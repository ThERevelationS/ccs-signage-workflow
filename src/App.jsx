import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Estimator from './pages/Estimator';
import EstimateDetail from './pages/EstimateDetail';
import FoundationEstimator from './pages/FoundationEstimator';
import FoundationCatalog from './pages/FoundationCatalog';
import VinylEstimator from './pages/VinylEstimator';
import MaintenanceEstimator from './pages/MaintenanceEstimator';
import ChannelLetterEstimator from './pages/ChannelLetterEstimator';
import CNCEstimator from './pages/CNCEstimator';
import LaserEstimator from './pages/LaserEstimator';
import MetalEstimator from './pages/MetalEstimator';
import BrickStoneEstimator from './pages/BrickStoneEstimator';
import PaintingEstimator from './pages/PaintingEstimator';
import FoundationSettings from './pages/FoundationSettings';
import PaintingSettings from './pages/PaintingSettings';
import CNCSettings from './pages/CNCSettings';
import LaserSettings from './pages/LaserSettings';
import MetalSettings from './pages/MetalSettings';
import MaintenanceSettings from './pages/MaintenanceSettings';
import InstallationSettings from './pages/InstallationSettings';
import VinylSettings from './pages/VinylSettings';
import VinylInventory from './pages/VinylInventory';
import SalesHome from './pages/SalesHome';
import EstimatorQueues from './pages/EstimatorQueues';
import EstimatorCustomers from './pages/EstimatorCustomers';
import QuickPrice from './pages/QuickPrice';
import EstimatorProducts from './pages/EstimatorProducts';
import EstimatorParts from './pages/EstimatorParts';
import EstimatorSettings from './pages/EstimatorSettings';
import EstimatorTools from './pages/EstimatorTools';
import EstimatorShell from './components/estimator/EstimatorShell';
import NewAllInOneEstimate from './pages/NewAllInOneEstimate';
import MasterInventory from './pages/MasterInventory';
import QuoteSettings from './pages/QuoteSettings';
import FleetTracking from './pages/FleetTracking';
import FleetOverview from './pages/FleetOverview';
import FleetEquipment from './pages/FleetEquipment';
import FleetEquipmentDetail from './pages/FleetEquipmentDetail';
import FleetMaintenance from './pages/FleetMaintenance';
import FleetWorkOrders from './pages/FleetWorkOrders';
import FleetParts from './pages/FleetParts';
import FleetFluids from './pages/FleetFluids';
import FleetRequests from './pages/FleetRequests';
import FleetHistory from './pages/FleetHistory';
import FleetSettings from './pages/FleetSettings';
import FleetPublicReport from './pages/FleetPublicReport';
import FleetMechanic from './pages/FleetMechanic';
import NewUserSetup from './pages/NewUserSetup';

const ESTIMATOR_PAGES = {
  NewAllInOneEstimate,
  Estimator,
  EstimateDetail,
  FoundationEstimator,
  FoundationCatalog,
  VinylEstimator,
  MaintenanceEstimator,
  ChannelLetterEstimator,
  CNCEstimator,
  LaserEstimator,
  MetalEstimator,
  BrickStoneEstimator,
  PaintingEstimator,
  FoundationSettings,
  PaintingSettings,
  CNCSettings,
  LaserSettings,
  MetalSettings,
  MaintenanceSettings,
  InstallationSettings,
  VinylSettings,
  VinylInventory,
  SalesHome,
  EstimatorQueues,
  EstimatorCustomers,
  QuickPrice,
  EstimatorProducts,
  EstimatorParts,
  EstimatorSettings,
  EstimatorTools,
  MasterInventory,
  QuoteSettings,
};

const FLEET_PAGES = {
  FleetOverview,
  FleetTracking,
  FleetEquipment,
  FleetEquipmentDetail,
  FleetMaintenance,
  FleetWorkOrders,
  FleetParts,
  FleetFluids,
  FleetRequests,
  FleetHistory,
  FleetSettings,
};

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Standalone external mechanic portal. This route intentionally bypasses the CCS
  // authenticated shell, but every read/write is independently authorized by a
  // revocable Fleet-scoped bearer link in fleetMechanicPortal.
  if (typeof window !== 'undefined' && window.location.pathname.toLowerCase() === '/fleetmechanic') {
    return <FleetMechanic />;
  }

  // Tightly scoped login-free Fleet issue reporting. The backend independently
  // enforces FleetSettings.public_reporting_enabled and exposes only id/name/type.
  if (typeof window !== 'undefined' && window.location.pathname.toLowerCase() === '/fleetreport') {
    return <FleetPublicReport />;
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      <Route path="/ResetPassword" element={<NewUserSetup />} />
      {Object.entries(ESTIMATOR_PAGES).map(([name, Page]) => (
        <Route
          key={name}
          path={`/${name}`}
          element={
            <LayoutWrapper currentPageName={name}>
              <EstimatorShell>
                <Page />
              </EstimatorShell>
            </LayoutWrapper>
          }
        />
      ))}
      {Object.entries(FLEET_PAGES).map(([name, Page]) => (
        <Route
          key={name}
          path={`/${name}`}
          element={
            <LayoutWrapper currentPageName={name}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App