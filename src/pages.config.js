import Permitting from './pages/Permitting';
import Design from './pages/Design';
import Production from './pages/Production';
import Fabrication from './pages/Fabrication';
import InstallationDeliver from './pages/InstallationDeliver';
import MainWorkflow from './pages/MainWorkflow';
import CompletedJobs from './pages/CompletedJobs';
import Estimating from './pages/Estimating';
import Sales from './pages/Sales';
import AdminSettings from './pages/AdminSettings';
import FeatureReports from './pages/FeatureReports';
import CompletedReports from './pages/CompletedReports';
import OrderForm from './pages/OrderForm';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Permitting": Permitting,
    "Design": Design,
    "Production": Production,
    "Fabrication": Fabrication,
    "InstallationDeliver": InstallationDeliver,
    "MainWorkflow": MainWorkflow,
    "CompletedJobs": CompletedJobs,
    "Estimating": Estimating,
    "Sales": Sales,
    "AdminSettings": AdminSettings,
    "FeatureReports": FeatureReports,
    "CompletedReports": CompletedReports,
    "OrderForm": OrderForm,
}

export const pagesConfig = {
    mainPage: "MainWorkflow",
    Pages: PAGES,
    Layout: __Layout,
};