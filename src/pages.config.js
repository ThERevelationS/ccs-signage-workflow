/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import { lazyPage } from './lib/lazyPage';
const AdminPermittingSettings = lazyPage(() => import('./pages/AdminPermittingSettings'));
const AdminSettings = lazyPage(() => import('./pages/AdminSettings'));
const CompletedReports = lazyPage(() => import('./pages/CompletedReports'));
const Design = lazyPage(() => import('./pages/Design'));
const Estimating = lazyPage(() => import('./pages/Estimating'));
const Fabrication = lazyPage(() => import('./pages/Fabrication'));
const FeatureReports = lazyPage(() => import('./pages/FeatureReports'));
const Financials = lazyPage(() => import('./pages/Financials'));
const Home = lazyPage(() => import('./pages/Home'));
const InstallationDeliver = lazyPage(() => import('./pages/InstallationDeliver'));
const MainWorkflow = lazyPage(() => import('./pages/MainWorkflow'));
const MondayMorningMeeting = lazyPage(() => import('./pages/MondayMorningMeeting'));
const MyWorkflow = lazyPage(() => import('./pages/MyWorkflow'));
const NewUserSetup = lazyPage(() => import('./pages/NewUserSetup'));
const ChangeOrders = lazyPage(() => import('./pages/ChangeOrders'));
const PurchaseOrders = lazyPage(() => import('./pages/PurchaseOrders'));
const Invoices = lazyPage(() => import('./pages/Invoices'));
const JobCosting = lazyPage(() => import('./pages/JobCosting'));
const Inventory = lazyPage(() => import('./pages/Inventory'));
const Opportunities = lazyPage(() => import('./pages/Opportunities'));
const OrderForm = lazyPage(() => import('./pages/OrderForm'));
const Permitting = lazyPage(() => import('./pages/Permitting'));
const PrivacyPolicy = lazyPage(() => import('./pages/PrivacyPolicy'));
const Production = lazyPage(() => import('./pages/Production'));
const ReportingDashboard = lazyPage(() => import('./pages/ReportingDashboard'));
const ResourcePlanning = lazyPage(() => import('./pages/ResourcePlanning'));
import __Layout from './Layout.jsx';
const SOP = lazyPage(() => import('./pages/SOP'));
const SIPs = lazyPage(() => import('./pages/SIPs'));
const SalesPipeline = lazyPage(() => import('./pages/SalesPipeline'));
const TemplateBuilder = lazyPage(() => import('./pages/TemplateBuilder'));
const TimeClock = lazyPage(() => import('./pages/TimeClock'));
const UserSettings = lazyPage(() => import('./pages/UserSettings'));


export const PAGES = {
    "AdminPermittingSettings": AdminPermittingSettings,
    "AdminSettings": AdminSettings,
    "CompletedReports": CompletedReports,
    "Design": Design,
    "Estimating": Estimating,
    "Fabrication": Fabrication,
    "FeatureReports": FeatureReports,
    "Financials": Financials,
    "Home": Home,
    "InstallationDeliver": InstallationDeliver,
    "MainWorkflow": MainWorkflow,
    "MondayMorningMeeting": MondayMorningMeeting,
    "MyWorkflow": MyWorkflow,
    "NewUserSetup": NewUserSetup,
    "ChangeOrders": ChangeOrders,
    "PurchaseOrders": PurchaseOrders,
    "Invoices": Invoices,
    "JobCosting": JobCosting,
    "Inventory": Inventory,
    "Opportunities": Opportunities,
    "OrderForm": OrderForm,
    "Permitting": Permitting,
    "PrivacyPolicy": PrivacyPolicy,
    "Production": Production,
    "ReportingDashboard": ReportingDashboard,
    "ResourcePlanning": ResourcePlanning,
    "SOP": SOP,
    "SIPs": SIPs,
    "SalesPipeline": SalesPipeline,
    "TemplateBuilder": TemplateBuilder,
    "TimeClock": TimeClock,
    "UserSettings": UserSettings,
}

export const pagesConfig = {
    mainPage: "MyWorkflow",
    Pages: PAGES,
    Layout: __Layout,
};