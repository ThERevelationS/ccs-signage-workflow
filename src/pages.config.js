import Permitting from './pages/Permitting';
import Design from './pages/Design';
import Production from './pages/Production';
import Fabrication from './pages/Fabrication';
import InstallationDeliver from './pages/InstallationDeliver';
import MainWorkflow from './pages/MainWorkflow';
import CompletedJobs from './pages/CompletedJobs';
import AdminSettings from './pages/AdminSettings';
import FeatureReports from './pages/FeatureReports';
import CompletedReports from './pages/CompletedReports';
import OrderForm from './pages/OrderForm';
import SalesPipeline from './pages/SalesPipeline';
import GoogleDriveCallback from './pages/GoogleDriveCallback';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Permitting": Permitting,
    "Design": Design,
    "Production": Production,
    "Fabrication": Fabrication,
    "InstallationDeliver": InstallationDeliver,
    "MainWorkflow": MainWorkflow,
    "CompletedJobs": CompletedJobs,
    "AdminSettings": AdminSettings,
    "FeatureReports": FeatureReports,
    "CompletedReports": CompletedReports,
    "OrderForm": OrderForm,
    "SalesPipeline": SalesPipeline,
    "GoogleDriveCallback": GoogleDriveCallback,
}

export const pagesConfig = {
    mainPage: "MainWorkflow",
    Pages: PAGES,
    Layout: __Layout,
};