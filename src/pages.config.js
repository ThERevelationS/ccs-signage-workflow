import AdminSettings from './pages/AdminSettings';
import CompletedJobs from './pages/CompletedJobs';
import CompletedReports from './pages/CompletedReports';
import Design from './pages/Design';
import Estimating from './pages/Estimating';
import Fabrication from './pages/Fabrication';
import FeatureReports from './pages/FeatureReports';
import Home from './pages/Home';
import InstallationDeliver from './pages/InstallationDeliver';
import MainWorkflow from './pages/MainWorkflow';
import OrderForm from './pages/OrderForm';
import Permitting from './pages/Permitting';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Production from './pages/Production';
import SalesPipeline from './pages/SalesPipeline';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminSettings": AdminSettings,
    "CompletedJobs": CompletedJobs,
    "CompletedReports": CompletedReports,
    "Design": Design,
    "Estimating": Estimating,
    "Fabrication": Fabrication,
    "FeatureReports": FeatureReports,
    "Home": Home,
    "InstallationDeliver": InstallationDeliver,
    "MainWorkflow": MainWorkflow,
    "OrderForm": OrderForm,
    "Permitting": Permitting,
    "PrivacyPolicy": PrivacyPolicy,
    "Production": Production,
    "SalesPipeline": SalesPipeline,
}

export const pagesConfig = {
    mainPage: "MainWorkflow",
    Pages: PAGES,
    Layout: __Layout,
};