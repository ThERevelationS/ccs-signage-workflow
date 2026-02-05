import React, { useState, useEffect, createContext, useContext } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  ClipboardCheck, 
  Pencil, 
  Hammer, 
  Wrench, 
  Truck, 
  BarChart3,
  CheckCircle2,
  Home,
  Calculator,
  DollarSign,
  Settings,
  LogOut,
  User,
  Lightbulb,
  ClipboardList,
  Menu,
  X,
  ChevronDown,
  Calendar,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelTop,
  Columns,
  Moon,
  Sun
} from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth/EmailGate";
import GlobalSearch from "@/components/workflow/GlobalSearch";
import AddTaskDialog from "@/components/workflow/AddTaskDialog";
import { MultiPageContainer, useMultiPageView } from "@/components/layout/MultiPageView";

// Context for multi-page view
const MultiPageContext = createContext(null);
export const useMultiPage = () => useContext(MultiPageContext);

const navigationItems = [
  { title: "My Workflow", url: createPageUrl("MyWorkflow"), icon: User, color: "#E8E0F0", borderColor: "#C9B8E0" },
  { title: "Main Workflow", url: createPageUrl("MainWorkflow"), icon: BarChart3, color: "#DCE8F0", borderColor: "#B8D0E0" },
  { title: "Sales Pipeline", url: createPageUrl("SalesPipeline"), icon: DollarSign, color: "#D4EDE8", borderColor: "#A8D8CC" },
  { title: "Estimating", url: createPageUrl("Estimating"), icon: Calculator, color: "#F0E8DC", borderColor: "#E0D0B8" },
  { title: "Permitting", url: createPageUrl("Permitting"), icon: ClipboardCheck, color: "#F0DCD8", borderColor: "#E0B8B0" },
  { title: "Design", url: createPageUrl("Design"), icon: Pencil, color: "#D8E8F0", borderColor: "#B0D0E8" },
  { title: "Production", url: createPageUrl("Production"), icon: Hammer, color: "#DCF0E4", borderColor: "#B0E0C8" },
  { title: "Fabrication", url: createPageUrl("Fabrication"), icon: Wrench, color: "#E8DCF0", borderColor: "#D0B8E0" },
  { title: "Installation/Delivery", url: createPageUrl("InstallationDeliver"), icon: Truck, color: "#F0E4DC", borderColor: "#E0C8B0" },
  { title: "Order Form", url: createPageUrl("OrderForm"), icon: ClipboardList, color: "#E0F0E8", borderColor: "#B8E0D0" },
];

const meetingsDropdownItems = [
  { title: "SIPs", url: createPageUrl("SIPs"), icon: ClipboardList, color: "#F8F0D8", borderColor: "#E8D8A8" },
  { title: "Monday Meeting", url: createPageUrl("MondayMorningMeeting"), icon: ClipboardList, color: "#F0F0D8", borderColor: "#D8D8A8" },
  { title: "Financials", url: createPageUrl("Financials"), icon: DollarSign, color: "#D8E4F0", borderColor: "#A8C8E0" },
];



const isUserAdmin = (user) => {
  return user?.role === "admin";
};

const getFullscreenStyles = (isFullscreen) => `
  html, body, #root {
    height: 100%;
    overflow: hidden;
  }
  ${isFullscreen ? `
    .main-scroll-container {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .main-scroll-container::-webkit-scrollbar {
      display: none;
    }
    .main-scroll-container:hover {
      scrollbar-width: thin;
    }
    .main-scroll-container:hover::-webkit-scrollbar {
      display: block;
      width: 8px;
    }
    .main-scroll-container:hover::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.2);
      border-radius: 4px;
    }
  ` : ''}
`;

const getDarkModeStyles = () => `
  .dark-mode {
    --clay-bg: #1a1a2e;
    --clay-card-bg: #16213e;
    --clay-text: #e4e4e7;
    --clay-text-muted: #a1a1aa;
  }
  
  /* Base text color for entire dark mode */
  .dark-mode {
    color: #e4e4e7 !important;
  }
  
  .dark-mode * {
    border-color: #475569;
  }
  
  .dark-mode .clay-card {
    background: linear-gradient(145deg, #2d3a4f, #1e293b) !important;
    color: #e4e4e7 !important;
    box-shadow: 
      8px 8px 20px rgba(0, 0, 0, 0.4),
      -8px -8px 20px rgba(50, 60, 80, 0.2),
      inset 1px 1px 4px rgba(255, 255, 255, 0.05),
      inset -1px -1px 4px rgba(0, 0, 0, 0.2) !important;
  }
  
  .dark-mode .clay-button {
    background: linear-gradient(145deg, #2d3a4f, #1e293b) !important;
    color: #e4e4e7 !important;
    box-shadow: 
      4px 4px 12px rgba(0, 0, 0, 0.3),
      -4px -4px 12px rgba(50, 60, 80, 0.2),
      inset 1px 1px 2px rgba(255, 255, 255, 0.05),
      inset -1px -1px 2px rgba(0, 0, 0, 0.1) !important;
  }
  
  /* Form inputs */
  .dark-mode input, 
  .dark-mode textarea, 
  .dark-mode select,
  .dark-mode [type="text"],
  .dark-mode [type="email"],
  .dark-mode [type="password"],
  .dark-mode [type="number"],
  .dark-mode [type="date"] {
    background-color: #0f172a !important;
    color: #f1f5f9 !important;
    border-color: #475569 !important;
  }
  
  .dark-mode input::placeholder, 
  .dark-mode textarea::placeholder {
    color: #64748b !important;
  }
  
  .dark-mode input:focus,
  .dark-mode textarea:focus,
  .dark-mode select:focus {
    border-color: #7c3aed !important;
    outline-color: #7c3aed !important;
  }
  
  /* Tables */
  .dark-mode table {
    background-color: #1e293b !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode thead,
  .dark-mode thead th {
    background-color: #334155 !important;
    color: #f1f5f9 !important;
  }
  
  .dark-mode tbody tr {
    background-color: #1e293b !important;
    border-color: #475569 !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode tbody tr:nth-child(even) {
    background-color: #263244 !important;
  }
  
  .dark-mode tbody tr:hover {
    background-color: #334155 !important;
  }
  
  .dark-mode tbody td {
    border-color: #475569 !important;
    color: #e4e4e7 !important;
  }
  
  /* Background colors */
  .dark-mode .bg-white {
    background-color: #1e293b !important;
  }
  
  .dark-mode .bg-gray-50,
  .dark-mode .bg-gray-100 {
    background-color: #263244 !important;
  }
  
  .dark-mode .bg-gray-200 {
    background-color: #334155 !important;
  }
  
  .dark-mode .bg-gray-100\\/50,
  .dark-mode .bg-white\\/50, 
  .dark-mode .bg-white\\/70,
  .dark-mode .bg-white\\/80,
  .dark-mode .bg-white\\/90,
  .dark-mode .bg-white\\/95 {
    background-color: rgba(30, 41, 59, 0.8) !important;
  }
  
  /* Text colors - ensure high contrast */
  .dark-mode .text-gray-900,
  .dark-mode .text-gray-800 {
    color: #f8fafc !important;
  }
  
  .dark-mode .text-gray-700,
  .dark-mode .text-gray-600 {
    color: #e2e8f0 !important;
  }
  
  .dark-mode .text-gray-500 {
    color: #94a3b8 !important;
  }
  
  .dark-mode .text-gray-400,
  .dark-mode .text-gray-300 {
    color: #94a3b8 !important;
  }
  
  .dark-mode .text-black {
    color: #f8fafc !important;
  }
  
  /* Border colors */
  .dark-mode .border,
  .dark-mode .border-b,
  .dark-mode .border-r,
  .dark-mode .border-t,
  .dark-mode .border-l {
    border-color: #475569 !important;
  }
  
  .dark-mode .border-gray-100,
  .dark-mode .border-gray-200,
  .dark-mode .border-gray-300 {
    border-color: #475569 !important;
  }
  
  /* Colored backgrounds with better contrast */
  .dark-mode .bg-green-50 {
    background-color: rgba(34, 197, 94, 0.2) !important;
    color: #86efac !important;
  }
  
  .dark-mode .bg-green-100 {
    background-color: rgba(34, 197, 94, 0.3) !important;
    color: #86efac !important;
  }
  
  .dark-mode .bg-blue-50 {
    background-color: rgba(59, 130, 246, 0.2) !important;
    color: #93c5fd !important;
  }
  
  .dark-mode .bg-blue-100 {
    background-color: rgba(59, 130, 246, 0.3) !important;
    color: #93c5fd !important;
  }
  
  .dark-mode .bg-orange-50,
  .dark-mode .bg-yellow-50,
  .dark-mode .bg-amber-50 {
    background-color: rgba(251, 191, 36, 0.2) !important;
    color: #fcd34d !important;
  }
  
  .dark-mode .bg-orange-100,
  .dark-mode .bg-yellow-100,
  .dark-mode .bg-amber-100 {
    background-color: rgba(251, 191, 36, 0.3) !important;
    color: #fcd34d !important;
  }
  
  .dark-mode .bg-purple-50 {
    background-color: rgba(168, 85, 247, 0.2) !important;
    color: #c4b5fd !important;
  }
  
  .dark-mode .bg-purple-100 {
    background-color: rgba(168, 85, 247, 0.3) !important;
    color: #c4b5fd !important;
  }
  
  .dark-mode .bg-red-50 {
    background-color: rgba(239, 68, 68, 0.2) !important;
    color: #fca5a5 !important;
  }
  
  .dark-mode .bg-red-100 {
    background-color: rgba(239, 68, 68, 0.3) !important;
    color: #fca5a5 !important;
  }
  
  .dark-mode .bg-pink-50 {
    background-color: rgba(236, 72, 153, 0.2) !important;
    color: #f9a8d4 !important;
  }
  
  .dark-mode .bg-indigo-50 {
    background-color: rgba(99, 102, 241, 0.2) !important;
    color: #a5b4fc !important;
  }
  
  .dark-mode .bg-teal-50 {
    background-color: rgba(20, 184, 166, 0.2) !important;
    color: #5eead4 !important;
  }
  
  /* Text colors for colored text */
  .dark-mode .text-green-700,
  .dark-mode .text-green-800,
  .dark-mode .text-green-900 {
    color: #86efac !important;
  }
  
  .dark-mode .text-green-600 {
    color: #4ade80 !important;
  }
  
  .dark-mode .text-blue-700,
  .dark-mode .text-blue-800,
  .dark-mode .text-blue-900 {
    color: #93c5fd !important;
  }
  
  .dark-mode .text-blue-600 {
    color: #60a5fa !important;
  }
  
  .dark-mode .text-purple-700,
  .dark-mode .text-purple-800,
  .dark-mode .text-purple-900 {
    color: #c4b5fd !important;
  }
  
  .dark-mode .text-red-700,
  .dark-mode .text-red-800 {
    color: #fca5a5 !important;
  }
  
  .dark-mode .text-orange-700,
  .dark-mode .text-orange-800,
  .dark-mode .text-yellow-700,
  .dark-mode .text-yellow-800,
  .dark-mode .text-amber-700,
  .dark-mode .text-amber-800 {
    color: #fcd34d !important;
  }
  
  /* Radix UI components */
  .dark-mode [data-radix-popper-content-wrapper] > div,
  .dark-mode [data-radix-popper-content-wrapper] > *,
  .dark-mode [role="listbox"],
  .dark-mode [role="menu"],
  .dark-mode [data-radix-collection-item] {
    background-color: #1e293b !important;
    border-color: #475569 !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode [role="option"],
  .dark-mode [role="menuitem"] {
    color: #e4e4e7 !important;
  }
  
  .dark-mode [role="option"]:hover,
  .dark-mode [role="menuitem"]:hover,
  .dark-mode [data-highlighted] {
    background-color: #334155 !important;
    color: #f1f5f9 !important;
  }
  
  /* Dialog and Modal */
  .dark-mode [role="dialog"],
  .dark-mode [role="alertdialog"] {
    background-color: #1e293b !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode [role="dialog"] > div,
  .dark-mode [role="alertdialog"] > div {
    background-color: #1e293b !important;
  }
  
  .dark-mode [role="dialog"] h1,
  .dark-mode [role="dialog"] h2,
  .dark-mode [role="dialog"] h3,
  .dark-mode [role="alertdialog"] h1,
  .dark-mode [role="alertdialog"] h2,
  .dark-mode [role="alertdialog"] h3 {
    color: #f8fafc !important;
  }
  
  .dark-mode [role="dialog"] p,
  .dark-mode [role="alertdialog"] p {
    color: #cbd5e1 !important;
  }
  
  .dark-mode [role="dialog"] label,
  .dark-mode [role="alertdialog"] label {
    color: #e2e8f0 !important;
  }
  
  /* Hover states */
  .dark-mode .hover\\:bg-gray-50:hover,
  .dark-mode .hover\\:bg-gray-100:hover,
  .dark-mode .hover\\:bg-white:hover,
  .dark-mode .hover\\:bg-white\\/50:hover,
  .dark-mode .hover\\:bg-white\\/70:hover {
    background-color: #334155 !important;
  }
  
  /* Labels and headings */
  .dark-mode label {
    color: #e2e8f0 !important;
  }
  
  .dark-mode h1, 
  .dark-mode h2, 
  .dark-mode h3, 
  .dark-mode h4, 
  .dark-mode h5, 
  .dark-mode h6 {
    color: #f8fafc !important;
  }
  
  .dark-mode p {
    color: #cbd5e1 !important;
  }
  
  /* Buttons - ensure text is readable */
  .dark-mode button {
    color: #e4e4e7 !important;
  }
  
  .dark-mode button.bg-green-600,
  .dark-mode button.bg-green-500,
  .dark-mode .bg-green-600,
  .dark-mode .bg-green-500 {
    color: white !important;
  }
  
  .dark-mode button.bg-red-600,
  .dark-mode button.bg-red-500,
  .dark-mode .bg-red-600,
  .dark-mode .bg-red-500 {
    color: white !important;
  }
  
  .dark-mode button.bg-blue-600,
  .dark-mode button.bg-blue-500,
  .dark-mode .bg-blue-600,
  .dark-mode .bg-blue-500 {
    color: white !important;
  }
  
  .dark-mode button.bg-purple-600,
  .dark-mode button.bg-purple-500,
  .dark-mode .bg-purple-600,
  .dark-mode .bg-purple-500 {
    color: white !important;
  }
  
  /* Tabs */
  .dark-mode [role="tablist"] {
    background-color: #263244 !important;
  }
  
  .dark-mode [role="tab"] {
    color: #94a3b8 !important;
  }
  
  .dark-mode [role="tab"][data-state="active"] {
    background-color: #1e293b !important;
    color: #f1f5f9 !important;
  }
  
  .dark-mode [role="tabpanel"] {
    background-color: #1e293b !important;
    color: #e4e4e7 !important;
  }
  
  /* Checkbox and Switch */
  .dark-mode [role="checkbox"] {
    border-color: #64748b !important;
    background-color: #1e293b !important;
  }
  
  .dark-mode [role="checkbox"][data-state="checked"] {
    background-color: #7c3aed !important;
    border-color: #7c3aed !important;
  }
  
  .dark-mode [role="switch"] {
    background-color: #475569 !important;
  }
  
  .dark-mode [role="switch"][data-state="checked"] {
    background-color: #7c3aed !important;
  }
  
  /* Select trigger */
  .dark-mode [data-radix-select-trigger],
  .dark-mode button[role="combobox"] {
    background-color: #1e293b !important;
    border-color: #475569 !important;
    color: #e4e4e7 !important;
  }
  
  /* Progress bars */
  .dark-mode [role="progressbar"] {
    background-color: #334155 !important;
  }
  
  /* Scrollbars */
  .dark-mode ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  .dark-mode ::-webkit-scrollbar-track {
    background: #1e293b;
  }
  
  .dark-mode ::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }
  
  .dark-mode ::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }
  
  /* Fix inline style backgrounds */
  .dark-mode div[style*="background: linear-gradient(135deg, rgba(255,255,255"],
  .dark-mode div[style*="background: linear-gradient(145deg, rgba(255,255,255"],
  .dark-mode div[style*="background: linear-gradient(135deg, rgba(255, 255, 255"],
  .dark-mode div[style*="background: linear-gradient(145deg, rgba(255, 255, 255"] {
    background: linear-gradient(145deg, #2d3a4f, #1e293b) !important;
  }
  
  .dark-mode div[style*="rgba(240,240,240"],
  .dark-mode div[style*="rgba(240, 240, 240"] {
    background: #263244 !important;
  }
  
  /* Gradient backgrounds */
  .dark-mode .bg-gradient-to-r,
  .dark-mode .bg-gradient-to-br,
  .dark-mode .bg-gradient-to-b,
  .dark-mode .bg-gradient-to-l,
  .dark-mode .bg-gradient-to-t {
    background: #1e293b !important;
  }
  
  /* Calendar */
  .dark-mode .rdp {
    background-color: #1e293b !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode .rdp-caption {
    color: #f1f5f9 !important;
  }
  
  .dark-mode .rdp-head_cell {
    color: #94a3b8 !important;
  }
  
  .dark-mode .rdp-day {
    color: #e4e4e7 !important;
  }
  
  .dark-mode .rdp-day:hover {
    background-color: #334155 !important;
  }
  
  .dark-mode .rdp-day_selected {
    background-color: #7c3aed !important;
    color: white !important;
  }
  
  .dark-mode .rdp-day_today {
    color: #a78bfa !important;
    font-weight: bold !important;
  }
  
  /* Badges - ensure text contrast */
  .dark-mode .bg-green-600,
  .dark-mode .bg-red-600,
  .dark-mode .bg-blue-600,
  .dark-mode .bg-purple-600,
  .dark-mode .bg-orange-600,
  .dark-mode .bg-yellow-600 {
    color: white !important;
  }
  
  /* Shadow adjustments */
  .dark-mode .shadow,
  .dark-mode .shadow-sm,
  .dark-mode .shadow-md,
  .dark-mode .shadow-lg,
  .dark-mode .shadow-xl {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3) !important;
  }
  
  /* Links */
  .dark-mode a {
    color: inherit;
  }
  
  .dark-mode a.text-blue-600,
  .dark-mode a.text-blue-500 {
    color: #60a5fa !important;
  }
  
  /* Dividers */
  .dark-mode hr,
  .dark-mode .divide-y > *,
  .dark-mode .divide-x > * {
    border-color: #475569 !important;
  }
  
  /* Cards with specific stage colors - darken them */
  .dark-mode .clay-card[style*="background: linear-gradient"] {
    filter: brightness(0.7) saturate(0.8);
  }
  
  /* Ensure icons are visible */
  .dark-mode svg {
    color: inherit;
  }
  
  /* Alert components */
  .dark-mode .bg-destructive {
    background-color: rgba(239, 68, 68, 0.2) !important;
  }
  
  .dark-mode .text-destructive {
    color: #fca5a5 !important;
  }
  
  /* Tooltip */
  .dark-mode [role="tooltip"] {
    background-color: #334155 !important;
    color: #f1f5f9 !important;
    border-color: #475569 !important;
  }
  
  /* Accordion */
  .dark-mode [data-state="open"] > div,
  .dark-mode [data-state="closed"] > div {
    background-color: transparent !important;
  }
  
  /* Sheet/Drawer */
  .dark-mode [data-vaul-drawer] {
    background-color: #1e293b !important;
  }
  
  /* Command palette */
  .dark-mode [cmdk-root] {
    background-color: #1e293b !important;
  }
  
  .dark-mode [cmdk-input] {
    background-color: #0f172a !important;
    color: #f1f5f9 !important;
  }
  
  .dark-mode [cmdk-item] {
    color: #e4e4e7 !important;
  }
  
  .dark-mode [cmdk-item][aria-selected="true"] {
    background-color: #334155 !important;
  }
`;

function LayoutContent({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [meetingsDropdownOpen, setMeetingsDropdownOpen] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const { currentUser, isRegistered, logout, getUserFirstName } = useAuth();
  
  // Multi-page view state
  const { additionalPages, addPage, removePage, clearPages, isInMultiView } = useMultiPageView();
  
  // Dark mode preference - default to true for power savings
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved !== null ? saved === "true" : true; // Default to dark mode
  });

  useEffect(() => {
    localStorage.setItem("darkMode", isDarkMode.toString());
  }, [isDarkMode]);
  
  // Navigation layout preference - "top" or "side"
  const [navLayout, setNavLayout] = useState(() => {
    return localStorage.getItem("navLayout") || "top";
  });

  useEffect(() => {
    localStorage.setItem("navLayout", navLayout);
  }, [navLayout]);

  // Handle Ctrl+Click for multi-page view
  const handleNavClick = (e, item) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Extract page name from URL
      const pageName = item.url.split('/').pop();
      addPage(pageName, item.title);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      setIsCollapsed(isFullscreen);
      // Prevent logout/email prompt in fullscreen
      if (isFullscreen) {
        localStorage.setItem("fullscreenMode", "true");
      } else {
        localStorage.removeItem("fullscreenMode");
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const shouldShowNav = !isCollapsed || isHovered;
  const isSideNav = navLayout === "side" && !isCollapsed;

  return (
    <>
      <style>{`
                ${getFullscreenStyles(isCollapsed)}
                ${getDarkModeStyles()}
        :root {
          --clay-lavender: #E0D4F7;
          --clay-mint: #C8F4E9;
          --clay-blue: #D4E9F7;
          --clay-peach: #FFE4D6;
          --clay-pink: #FFD6E8;
          --clay-bg: #F5F3FF;
        }
        
        * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        .clay-card {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
          border-radius: 20px;
          box-shadow: 
            8px 8px 20px rgba(0, 0, 0, 0.08),
            -8px -8px 20px rgba(255, 255, 255, 0.9),
            inset 2px 2px 8px rgba(255, 255, 255, 0.5),
            inset -2px -2px 8px rgba(0, 0, 0, 0.05);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .clay-card:not([role="dialog"]):hover {
          box-shadow: 
            10px 10px 24px rgba(0, 0, 0, 0.1),
            -10px -10px 24px rgba(255, 255, 255, 0.9),
            inset 2px 2px 8px rgba(255, 255, 255, 0.6),
            inset -2px -2px 8px rgba(0, 0, 0, 0.06);
        }
        
        .clay-button {
          border-radius: 16px;
          box-shadow: 
            4px 4px 12px rgba(0, 0, 0, 0.08),
            -4px -4px 12px rgba(255, 255, 255, 0.9),
            inset 1px 1px 4px rgba(255, 255, 255, 0.5),
            inset -1px -1px 4px rgba(0, 0, 0, 0.05);
          transition: all 0.2s ease;
        }
        
        .clay-button:active {
          box-shadow: 
            inset 4px 4px 8px rgba(0, 0, 0, 0.1),
            inset -4px -4px 8px rgba(255, 255, 255, 0.5);
          transform: scale(0.98);
        }

        .top-nav {
          transition: transform 0.3s ease-in-out;
        }

        .top-nav.collapsed {
          transform: translateY(-100%);
        }

        .top-nav.show {
          transform: translateY(0);
        }

        .side-nav {
          transition: transform 0.3s ease-in-out;
        }

        .side-nav.collapsed {
          transform: translateX(-100%);
        }
      `}</style>
      
      <div className={`h-full flex ${isSideNav ? 'flex-row' : 'flex-col'} ${isDarkMode ? 'dark-mode' : ''}`} style={{ background: isDarkMode ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' : 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        {/* Hover detection area when collapsed */}
        {isCollapsed && (
          <div 
            className="fixed top-0 left-0 right-0 h-4 z-40"
            onMouseEnter={() => setIsHovered(true)}
          />
        )}

        {/* Side Navigation */}
        {isSideNav && (
          <nav 
            className="side-nav fixed top-0 left-0 bottom-0 z-50 w-56 flex flex-col"
            style={{ 
              background: isDarkMode 
                ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(22, 33, 62, 0.95) 100%)'
                : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
              backdropFilter: 'blur(10px)',
              boxShadow: isDarkMode ? '4px 0 20px rgba(0,0,0,0.3)' : '4px 0 20px rgba(0,0,0,0.08)',
            }}
          >
            <div className="p-3">
              {/* Logo with nav toggle */}
              <div className="clay-card px-3 py-2 flex items-center gap-2 mb-4">
                <button
                  onClick={() => setNavLayout(navLayout === "top" ? "side" : "top")}
                  className="w-8 h-8 rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity"
                  style={{ 
                    background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)',
                    boxShadow: 'inset 2px 2px 6px rgba(255,255,255,0.7), inset -2px -2px 6px rgba(0,0,0,0.1)'
                  }}
                  title="Switch to Top Bar"
                >
                  <PanelTop className="w-4 h-4 text-purple-700" />
                </button>
                <div>
                  <h2 className="font-bold text-gray-800 text-sm leading-tight">Sign Shop</h2>
                  <p className="text-xs text-gray-500">Workflow</p>
                </div>
              </div>

              {/* Time Clock + Add Task side by side, Search full width below */}
              <div className="space-y-2 mb-4">
                <div className="flex gap-2">
                  <Link
                    to={createPageUrl("TimeClock")}
                    className="flex-1 px-4 py-2 rounded-xl transition-all duration-300 flex items-center gap-2 border-2 hover:clay-card border-green-300 bg-green-50"
                  >
                    <Home className="w-4 h-4 text-green-600" />
                    <span className="font-bold text-sm text-green-700">Time Clock</span>
                  </Link>

                  <button
                    onClick={() => setShowAddTaskDialog(true)}
                    className="flex-1 px-4 py-2 rounded-xl transition-all duration-300 flex items-center gap-2 border-2 hover:clay-card border-blue-300 bg-blue-50"
                  >
                    <ClipboardList className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-sm text-blue-700">+ Task</span>
                  </button>
                </div>

                <GlobalSearch className="w-full justify-center" />
              </div>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <div className="space-y-1">
                {navigationItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  const isInSplit = additionalPages.find(p => item.url.includes(p.name));
                  return (
                    <Link
                      key={item.title}
                      to={item.url}
                      onClick={(e) => handleNavClick(e, item)}
                      className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 border ${
                        isActive ? 'clay-card shadow-md' : isInSplit ? 'border-purple-200 bg-purple-50' : 'hover:clay-card'
                      }`}
                      style={{ 
                        background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.95) 100%)`,
                        borderColor: isActive ? item.borderColor : isInSplit ? '#C4B5FD' : item.borderColor
                      }}
                      title="Ctrl+Click to open in split view"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#6B46C1' : isInSplit ? '#7C3AED' : '#6B7280' }} />
                      <span className={`font-medium text-sm ${isActive ? 'text-purple-900' : isInSplit ? 'text-purple-700' : 'text-gray-700'}`}>
                        {item.title}
                      </span>
                      {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                    </Link>
                  );
                })}
                
                {/* Meetings Section */}
                <div className="pt-2 border-t border-gray-200 mt-2">
                  <span className="text-xs font-medium text-gray-400 px-3">Meetings</span>
                  {meetingsDropdownItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    const isInSplit = additionalPages.find(p => item.url.includes(p.name));
                    return (
                      <Link
                        key={item.title}
                        to={item.url}
                        onClick={(e) => handleNavClick(e, item)}
                        className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 border ${
                          isActive ? 'clay-card border-purple-300 shadow-md' : isInSplit ? 'border-purple-200 bg-purple-50' : 'hover:clay-card border-transparent hover:border-gray-200'
                        }`}
                        style={isActive ? { 
                          background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.9) 100%)` 
                        } : {}}
                        title="Ctrl+Click to open in split view"
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#6B46C1' : isInSplit ? '#7C3AED' : '#9CA3AF' }} />
                        <span className={`font-medium text-sm ${isActive ? 'text-purple-900' : isInSplit ? 'text-purple-700' : 'text-gray-700'}`}>
                          {item.title}
                        </span>
                        {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </nav>
        )}

        {/* Top Navigation */}
        {!isSideNav && (
          <nav 
            className={`top-nav fixed top-0 left-0 right-0 z-50 ${isCollapsed ? (isHovered ? 'show' : 'collapsed') : ''}`}
            onMouseLeave={() => isCollapsed && setIsHovered(false)}
            style={{ 
              background: isDarkMode 
                ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(22, 33, 62, 0.95) 100%)'
                : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
              backdropFilter: 'blur(10px)',
              boxShadow: isDarkMode ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.08)',
              minHeight: 'auto'
            }}
          >
            <div className="px-4 py-2">
              <div className="flex items-center justify-between">
                {/* Logo with nav toggle */}
                <div className="clay-card px-3 py-2 flex items-center gap-2 sm:gap-3 sm:px-4">
                  <button
                    onClick={() => setNavLayout(navLayout === "top" ? "side" : "top")}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center hover:opacity-80 transition-opacity"
                    style={{ 
                      background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)',
                      boxShadow: 'inset 2px 2px 6px rgba(255,255,255,0.7), inset -2px -2px 6px rgba(0,0,0,0.1)'
                    }}
                    title="Switch to Sidebar"
                  >
                    <PanelLeft className="w-4 h-4 sm:w-5 sm:h-5 text-purple-700" />
                  </button>
                  <div className="hidden sm:block">
                    <h2 className="font-bold text-gray-800 text-lg leading-tight">Sign Shop</h2>
                    <p className="text-xs text-gray-500">Workflow Manager</p>
                  </div>
                </div>

                {/* Mobile Menu Button */}
                <button 
                  className="lg:hidden clay-button p-2"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>

                {/* Desktop Navigation Links */}
                <div className="hidden lg:flex items-center gap-1 flex-wrap flex-1 ml-4 max-w-[calc(100%-400px)]">
                  {navigationItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    const isInSplit = additionalPages.find(p => item.url.includes(p.name));
                    return (
                      <Link
                        key={item.title}
                        to={item.url}
                        onClick={(e) => handleNavClick(e, item)}
                        className={`px-2 py-1.5 rounded-lg transition-all duration-300 flex items-center gap-1.5 whitespace-nowrap border ${
                          isActive ? 'clay-card shadow-md' : isInSplit ? 'border-purple-200 bg-purple-50' : 'hover:clay-card'
                        }`}
                        style={{ 
                          background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.95) 100%)`,
                          borderColor: isActive ? item.borderColor : isInSplit ? '#C4B5FD' : item.borderColor
                        }}
                        title="Ctrl+Click to open in split view"
                      >
                        <item.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? '#6B46C1' : isInSplit ? '#7C3AED' : '#6B7280' }} />
                        <span className={`font-medium text-xs ${isActive ? 'text-purple-900' : isInSplit ? 'text-purple-700' : 'text-gray-700'}`}>
                          {item.title}
                        </span>
                        {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                      </Link>
                    );
                  })}
                  
                  {/* Meetings Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setMeetingsDropdownOpen(!meetingsDropdownOpen)}
                      onBlur={() => setTimeout(() => setMeetingsDropdownOpen(false), 150)}
                      className={`px-2 py-1.5 rounded-lg transition-all duration-300 flex items-center gap-1.5 whitespace-nowrap border ${
                        meetingsDropdownItems.some(item => location.pathname === item.url) 
                          ? 'clay-card border-purple-300 shadow-md' 
                          : 'hover:clay-card border-gray-200 hover:border-gray-300'
                      }`}
                      style={meetingsDropdownItems.some(item => location.pathname === item.url) ? { 
                        background: `linear-gradient(135deg, #FDE68A 0%, rgba(255,255,255,0.9) 100%)` 
                      } : {}}
                    >
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meetingsDropdownItems.some(item => location.pathname === item.url) ? '#6B46C1' : '#9CA3AF' }} />
                      <span className={`font-medium text-xs ${meetingsDropdownItems.some(item => location.pathname === item.url) ? 'text-purple-900' : 'text-gray-700'}`}>
                        Meetings
                      </span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${meetingsDropdownOpen ? 'rotate-180' : ''}`} style={{ color: meetingsDropdownItems.some(item => location.pathname === item.url) ? '#6B46C1' : '#9CA3AF' }} />
                    </button>
                    
                    {meetingsDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 py-1 rounded-lg border border-gray-200 shadow-lg z-50 min-w-[160px]" style={{ background: 'white' }}>
                        {meetingsDropdownItems.map((item) => {
                          const isActive = location.pathname === item.url;
                          const isInSplit = additionalPages.find(p => item.url.includes(p.name));
                          return (
                            <Link
                              key={item.title}
                              to={item.url}
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  e.preventDefault();
                                  const pageName = item.url.split('/').pop();
                                  addPage(pageName, item.title);
                                }
                                setMeetingsDropdownOpen(false);
                              }}
                              className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                                isActive ? 'bg-purple-50' : isInSplit ? 'bg-purple-50' : 'hover:bg-gray-50'
                              }`}
                              style={isActive ? { background: `linear-gradient(135deg, ${item.color}40 0%, rgba(255,255,255,0.9) 100%)` } : {}}
                              title="Ctrl+Click to open in split view"
                            >
                              <item.icon className="w-4 h-4" style={{ color: isActive ? '#6B46C1' : isInSplit ? '#7C3AED' : '#9CA3AF' }} />
                              <span className={`font-medium text-sm ${isActive ? 'text-purple-900' : isInSplit ? 'text-purple-700' : 'text-gray-700'}`}>
                                {item.title}
                              </span>
                              {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Time Clock + Add Task on top row, Search spans full width below */}
                <div className="hidden lg:flex lg:flex-col lg:gap-1">
                  <div className="flex gap-2">
                    <Link
                      to={createPageUrl("TimeClock")}
                      className="px-3 py-1.5 rounded-xl transition-all duration-300 flex items-center gap-2 border-2 hover:clay-card border-green-300 bg-green-50"
                    >
                      <Home className="w-4 h-4 text-green-600" />
                      <span className="font-bold text-sm text-green-700">Time Clock</span>
                    </Link>
                    
                    <button
                      onClick={() => setShowAddTaskDialog(true)}
                      className="px-3 py-1.5 rounded-xl transition-all duration-300 flex items-center gap-2 border-2 hover:clay-card border-blue-300 bg-blue-50"
                    >
                      <ClipboardList className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-sm text-blue-700">+ Task</span>
                    </button>
                  </div>
                  
                  <GlobalSearch className="w-full justify-center" />
                </div>
              </div>

              {/* Mobile Navigation Menu */}
              {mobileMenuOpen && (
                <div className="lg:hidden mt-2 pb-2 border-t border-gray-200 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    {[...navigationItems, ...meetingsDropdownItems].map((item) => {
                      const isActive = location.pathname === item.url;
                      const isInSplit = additionalPages.find(p => item.url.includes(p.name));
                      return (
                        <Link
                          key={item.title}
                          to={item.url}
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              e.preventDefault();
                              const pageName = item.url.split('/').pop();
                              addPage(pageName, item.title);
                            }
                            setMobileMenuOpen(false);
                          }}
                          className={`px-3 py-2 rounded-xl transition-all duration-300 flex items-center gap-2 ${
                            isActive ? 'clay-card' : isInSplit ? 'bg-purple-50' : 'hover:bg-gray-100'
                          }`}
                          style={isActive ? { 
                            background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.9) 100%)` 
                          } : {}}
                          title="Ctrl+Click to open in split view"
                        >
                          <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#6B46C1' : isInSplit ? '#7C3AED' : '#9CA3AF' }} />
                          <span className={`font-medium text-sm ${isActive ? 'text-purple-900' : isInSplit ? 'text-purple-700' : 'text-gray-600'}`}>
                            {item.title}
                          </span>
                          {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </nav>
        )}

        {/* Main content */}
        <main 
          className="flex-1 main-scroll-container" 
          style={{ 
            paddingTop: isSideNav ? '0' : (isCollapsed ? '16px' : '80px'),
            marginLeft: isSideNav ? '224px' : '0',
            height: '100vh',
            overflow: 'auto'
          }}
        >
          <MultiPageContext.Provider value={{ addPage, removePage, clearPages, isInMultiView, additionalPages }}>
            <MultiPageContainer 
              additionalPages={additionalPages} 
              onRemovePage={removePage}
              onClearAll={clearPages}
            >
              {children}
            </MultiPageContainer>
          </MultiPageContext.Provider>
        </main>

        {/* Add Task Dialog */}
        <AddTaskDialog 
          isOpen={showAddTaskDialog} 
          onClose={() => setShowAddTaskDialog(false)} 
        />

        {/* Floating Buttons - hidden in fullscreen */}
        {!isCollapsed && (
          <div className="fixed bottom-3 left-3 z-50 flex gap-1 opacity-20 hover:opacity-100 transition-opacity duration-200" style={{ marginLeft: isSideNav ? '224px' : '0' }}>
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
              style={{ 
                background: isDarkMode ? 'rgba(251, 191, 36, 0.8)' : 'rgba(30, 41, 59, 0.8)',
                color: isDarkMode ? '#78350f' : '#f1f5f9'
              }}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            </button>
            {/* Full Screen Toggle */}
            <button
              onClick={toggleFullScreen}
              className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
              style={{ 
                background: isDarkMode ? 'rgba(71, 85, 105, 0.8)' : 'rgba(191, 219, 254, 0.8)',
                color: isDarkMode ? '#e2e8f0' : '#1e40af'
              }}
              title="Toggle Fullscreen"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            {isRegistered && (
              <Link
                to={createPageUrl("FeatureReports")}
                className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
                style={{ 
                  background: isDarkMode ? 'rgba(71, 85, 105, 0.8)' : 'rgba(191, 219, 254, 0.8)',
                  color: isDarkMode ? '#e2e8f0' : '#1e40af'
                }}
              >
                <Lightbulb className="w-3 h-3" />
                <span>Reports</span>
              </Link>
            )}
            {isUserAdmin(currentUser) && (
              <Link
                to={createPageUrl("AdminSettings")}
                className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
                style={{ 
                  background: isDarkMode ? 'rgba(71, 85, 105, 0.8)' : 'rgba(191, 219, 254, 0.8)',
                  color: isDarkMode ? '#e2e8f0' : '#1e40af'
                }}
              >
                <Settings className="w-3 h-3" />
                <span>Admin</span>
              </Link>
            )}
            {isRegistered && (
              <Link
                to={createPageUrl("UserSettings")}
                className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
                style={{ 
                  background: isDarkMode ? 'rgba(71, 85, 105, 0.8)' : 'rgba(191, 219, 254, 0.8)',
                  color: isDarkMode ? '#e2e8f0' : '#1e40af'
                }}
              >
                <User className="w-3 h-3" />
                <span>My Info</span>
              </Link>
            )}
            {additionalPages.length > 0 && (
              <button
                onClick={clearPages}
                className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
                style={{ 
                  background: 'rgba(254, 202, 202, 0.8)',
                  color: '#991b1b'
                }}
                title="Clear split view"
              >
                <X className="w-3 h-3" />
                <span>Clear Split</span>
              </button>
            )}
            </div>
            )}
      </div>
    </>
  );
}

export default function Layout({ children }) {
  return (
    <AuthProvider>
      <LayoutContent>{children}</LayoutContent>
    </AuthProvider>
  );
}