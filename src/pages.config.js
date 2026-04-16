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
import AdminPermittingSettings from './pages/AdminPermittingSettings';
import AdminSettings from './pages/AdminSettings';
import CompletedReports from './pages/CompletedReports';
import Design from './pages/Design';
import Estimating from './pages/Estimating';
import Fabrication from './pages/Fabrication';
import FeatureReports from './pages/FeatureReports';
import Financials from './pages/Financials';
import Home from './pages/Home';
import InstallationDeliver from './pages/InstallationDeliver';
import MainWorkflow from './pages/MainWorkflow';
import MondayMorningMeeting from './pages/MondayMorningMeeting';
import MyWorkflow from './pages/MyWorkflow';
import NewUserSetup from './pages/NewUserSetup';
import OrderForm from './pages/OrderForm';
import Permitting from './pages/Permitting';
import PermittingRepository from './pages/PermittingRepository';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Production from './pages/Production';
import ReportingDashboard from './pages/ReportingDashboard';
import ResetPassword from './pages/ResetPassword.jsx';
import ResourcePlanning from './pages/ResourcePlanning';
import SIPs from './pages/SIPs';
import SalesPipeline from './pages/SalesPipeline';
import TemplateBuilder from './pages/TemplateBuilder';
import TimeClock from './pages/TimeClock';
import UserSettings from './pages/UserSettings';
import __Layout from './Layout.jsx';


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
    "OrderForm": OrderForm,
    "Permitting": Permitting,
    "PermittingRepository": PermittingRepository,
    "PrivacyPolicy": PrivacyPolicy,
    "Production": Production,
    "ReportingDashboard": ReportingDashboard,
    "ResetPassword": ResetPassword,
    "ResourcePlanning": ResourcePlanning,
    "SIPs": SIPs,
    "SalesPipeline": SalesPipeline,
    "TemplateBuilder": TemplateBuilder,
    "TimeClock": TimeClock,
    "UserSettings": UserSettings,
}

export const pagesConfig = {
    mainPage: "MainWorkflow",
    Pages: PAGES,
    Layout: __Layout,
};