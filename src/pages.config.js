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
import OrderForm from './pages/OrderForm';
import Permitting from './pages/Permitting';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Production from './pages/Production';
import ResetPassword from './pages/ResetPassword';
import SIPs from './pages/SIPs';
import SalesPipeline from './pages/SalesPipeline';
import TimeClock from './pages/TimeClock';
import __Layout from './Layout.jsx';


export const PAGES = {
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
    "OrderForm": OrderForm,
    "Permitting": Permitting,
    "PrivacyPolicy": PrivacyPolicy,
    "Production": Production,
    "ResetPassword": ResetPassword,
    "SIPs": SIPs,
    "SalesPipeline": SalesPipeline,
    "TimeClock": TimeClock,
}

export const pagesConfig = {
    mainPage: "MainWorkflow",
    Pages: PAGES,
    Layout: __Layout,
};