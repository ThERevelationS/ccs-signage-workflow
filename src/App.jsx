import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import CommandPalette from '@/components/CommandPalette';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { Suspense } from 'react';
import { lazyPage } from '@/lib/lazyPage';
import PageLoading from '@/components/layout/PageLoading';
import EstimatorShell from './components/estimator/EstimatorShell';

// Every page loads on first visit instead of shipping in the startup bundle.
const Estimator = lazyPage(() => import('./pages/Estimator'));
const EstimateDetail = lazyPage(() => import('./pages/EstimateDetail'));
const FoundationEstimator = lazyPage(() => import('./pages/FoundationEstimator'));
const FoundationCatalog = lazyPage(() => import('./pages/FoundationCatalog'));
const VinylEstimator = lazyPage(() => import('./pages/VinylEstimator'));
const MaintenanceEstimator = lazyPage(() => import('./pages/MaintenanceEstimator'));
const ChannelLetterEstimator = lazyPage(() => import('./pages/ChannelLetterEstimator'));
const CNCEstimator = lazyPage(() => import('./pages/CNCEstimator'));
const LaserEstimator = lazyPage(() => import('./pages/LaserEstimator'));
const CustomItemsEstimator = lazyPage(() => import('./pages/CustomItemsEstimator'));
const MetalEstimator = lazyPage(() => import('./pages/MetalEstimator'));
const BrickStoneEstimator = lazyPage(() => import('./pages/BrickStoneEstimator'));
const PaintingEstimator = lazyPage(() => import('./pages/PaintingEstimator'));
const FoundationSettings = lazyPage(() => import('./pages/FoundationSettings'));
const PaintingSettings = lazyPage(() => import('./pages/PaintingSettings'));
const CNCSettings = lazyPage(() => import('./pages/CNCSettings'));
const LaserSettings = lazyPage(() => import('./pages/LaserSettings'));
const MetalSettings = lazyPage(() => import('./pages/MetalSettings'));
const MaintenanceSettings = lazyPage(() => import('./pages/MaintenanceSettings'));
const InstallationSettings = lazyPage(() => import('./pages/InstallationSettings'));
const VinylSettings = lazyPage(() => import('./pages/VinylSettings'));
const VinylInventory = lazyPage(() => import('./pages/VinylInventory'));
const SalesHome = lazyPage(() => import('./pages/SalesHome'));
const EstimatorQueues = lazyPage(() => import('./pages/EstimatorQueues'));
const ProductQueues = lazyPage(() => import('./pages/ProductQueues'));
const JobWorkspace = lazyPage(() => import('./pages/JobWorkspace'));
const EstimatorCustomers = lazyPage(() => import('./pages/EstimatorCustomers'));
const QuickPrice = lazyPage(() => import('./pages/QuickPrice'));
const CrmEvents = lazyPage(() => import('./pages/CrmEvents'));
const WalkIn = lazyPage(() => import('./pages/WalkIn'));
const OpsReports = lazyPage(() => import('./pages/OpsReports'));
const EstimatorProducts = lazyPage(() => import('./pages/EstimatorProducts'));
const EstimatorParts = lazyPage(() => import('./pages/EstimatorParts'));
const EstimatorSettings = lazyPage(() => import('./pages/EstimatorSettings'));
const EstimatorTools = lazyPage(() => import('./pages/EstimatorTools'));
const NewAllInOneEstimate = lazyPage(() => import('./pages/NewAllInOneEstimate'));
const MasterInventory = lazyPage(() => import('./pages/MasterInventory'));
const QuoteSettings = lazyPage(() => import('./pages/QuoteSettings'));
const FleetTracking = lazyPage(() => import('./pages/FleetTracking'));
const FleetOverview = lazyPage(() => import('./pages/FleetOverview'));
const FleetSearch = lazyPage(() => import('./pages/FleetSearch'));
const FleetNotifications = lazyPage(() => import('./pages/FleetNotifications'));
const FleetEquipment = lazyPage(() => import('./pages/FleetEquipment'));
const FleetEquipmentDetail = lazyPage(() => import('./pages/FleetEquipmentDetail'));
const FleetMaintenance = lazyPage(() => import('./pages/FleetMaintenance'));
const FleetInspections = lazyPage(() => import('./pages/FleetInspections'));
const FleetWorkOrders = lazyPage(() => import('./pages/FleetWorkOrders'));
const FleetParts = lazyPage(() => import('./pages/FleetParts'));
const FleetFluids = lazyPage(() => import('./pages/FleetFluids'));
const FleetFuel = lazyPage(() => import('./pages/FleetFuel'));
const FleetWarranties = lazyPage(() => import('./pages/FleetWarranties'));
const FleetReservations = lazyPage(() => import('./pages/FleetReservations'));
const FleetRequests = lazyPage(() => import('./pages/FleetRequests'));
const FleetHistory = lazyPage(() => import('./pages/FleetHistory'));
const FleetAnalytics = lazyPage(() => import('./pages/FleetAnalytics'));
const FleetPublicReport = lazyPage(() => import('./pages/FleetPublicReport'));
const FleetMechanic = lazyPage(() => import('./pages/FleetMechanic'));
const CustomerPortal = lazyPage(() => import('./pages/CustomerPortal'));
const NewUserSetup = lazyPage(() => import('./pages/NewUserSetup'));
const PermittingDocs = lazyPage(() => import('./pages/PermittingDocs'));
const WorkOrderTraveler = lazyPage(() => import('./pages/WorkOrderTraveler'));
const ProductionSchedule = lazyPage(() => import('./pages/ProductionSchedule'));

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
  CustomItemsEstimator,
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
  ProductQueues,
  JobWorkspace,
  EstimatorCustomers,
  QuickPrice,
  CrmEvents,
  WalkIn,
  OpsReports,
  EstimatorProducts,
  EstimatorParts,
  EstimatorSettings,
  EstimatorTools,
  MasterInventory,
  QuoteSettings,
};

const FLEET_PAGES = {
  FleetOverview,
  FleetSearch,
  FleetNotifications,
  FleetTracking,
  FleetEquipment,
  FleetEquipmentDetail,
  FleetMaintenance,
  FleetInspections,
  FleetWorkOrders,
  FleetParts,
  FleetFluids,
  FleetFuel,
  FleetWarranties,
  FleetReservations,
  FleetRequests,
  FleetHistory,
  FleetAnalytics,
};

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

// The navigation shell stays on screen while a page's code is loading.
const LayoutWrapper = ({ children, currentPageName }) => {
  const page = <Suspense fallback={<PageLoading />}>{children}</Suspense>;
  return Layout ? <Layout currentPageName={currentPageName}>{page}</Layout> : page;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

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
    <>
    <CommandPalette />
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      <Route path="/ResetPassword" element={<NewUserSetup />} />
      <Route path="/PermittingRepository" element={<Navigate to="/Permitting?view=jurisdictions" replace />} />
      <Route path="/FleetSettings" element={<Navigate to="/AdminSettings?tab=fleet" replace />} />
      <Route path="/PermittingDocs" element={
        <LayoutWrapper currentPageName="PermittingDocs">
          <PermittingDocs />
        </LayoutWrapper>
      } />
      <Route path="/WorkOrderTraveler" element={
        <LayoutWrapper currentPageName="WorkOrderTraveler">
          <WorkOrderTraveler />
        </LayoutWrapper>
      } />
      <Route path="/ProductionSchedule" element={
        <LayoutWrapper currentPageName="ProductionSchedule">
          <ProductionSchedule />
        </LayoutWrapper>
      } />
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
      {Object.entries(Pages).filter(([path]) => path !== "PermittingRepository").map(([path, Page]) => (
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
    </Suspense>
    </>
  );
};


function standaloneFleetPage() {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase() || '/';
  if (path === '/fleetmechanic') return FleetMechanic;
  if (path === '/fleetreport') return FleetPublicReport;
  if (path === '/customerportal') return CustomerPortal;
  return null;
}

function App() {
  const StandaloneFleetPage = standaloneFleetPage();

  // These two Fleet surfaces are intentionally outside CCS authentication, navigation,
  // layout, navigation tracking, and the visual editor shell. Their backend functions
  // independently enforce their narrow public/mechanic authorization boundaries.
  if (StandaloneFleetPage) {
    return (
      <QueryClientProvider client={queryClientInstance}>
        <Suspense fallback={<PageLoading />}>
          <StandaloneFleetPage />
        </Suspense>
        <Toaster />
      </QueryClientProvider>
    );
  }

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