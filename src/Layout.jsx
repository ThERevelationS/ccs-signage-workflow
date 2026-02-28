import React, { useState, useEffect, createContext, useContext, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  PanelLeft,
  PanelTop,
  Columns,
  ChevronLeft,
  Clock,
} from "lucide-react";
import { DarkModeSwitch } from "react-toggle-dark-mode";
import { AuthProvider, useAuth } from "@/components/auth/EmailGate";
import GlobalSearch from "@/components/workflow/GlobalSearch";
import AddTaskDialog from "@/components/workflow/AddTaskDialog";
import { MultiPageContainer, useMultiPageView } from "@/components/layout/MultiPageView";
import { base44 } from "@/api/base44Client";
import { ImportProgressProvider } from "@/components/shared/ImportProgressContext";

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
  { title: "Permitting Repository", url: createPageUrl("PermittingRepository"), icon: ClipboardList, color: "#F0E8F8", borderColor: "#D8B8F0" },
];

const meetingsDropdownItems = [
  { title: "SIPs", url: createPageUrl("SIPs"), icon: ClipboardList, color: "#F8F0D8", borderColor: "#E8D8A8" },
  { title: "Monday Meeting", url: createPageUrl("MondayMorningMeeting"), icon: ClipboardList, color: "#F0F0D8", borderColor: "#D8D8A8" },
  { title: "Financials", url: createPageUrl("Financials"), icon: DollarSign, color: "#D8E4F0", borderColor: "#A8C8E0" },
  { title: "Calendar", url: createPageUrl("WorkOrderCalendar"), icon: Calendar, color: "#EDE9FE", borderColor: "#C4B5FD" },

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



const ROOT_ROUTES = [
  createPageUrl("MainWorkflow"),
  createPageUrl("MyWorkflow"),
  createPageUrl("SalesPipeline"),
  createPageUrl("OrderForm"),
  createPageUrl("TimeClock"),
  createPageUrl("AdminSettings"),
  createPageUrl("UserSettings"),
  "/",
];

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
  
  // Pending imports count for nav badge
  const [pendingImportCount, setPendingImportCount] = useState(0);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.entities.PendingImport.filter({ status: 'pending' });
        setPendingImportCount(Array.isArray(res) ? res.length : 0);
      } catch {}
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  // Detect mobile
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Scroll position preservation per tab on mobile
  const scrollPositions = useRef({});
  const mainRef = useRef(null);
  const prevPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (!isMobile) return;
    const prev = prevPathnameRef.current;
    const curr = location.pathname;
    if (prev !== curr) {
      if (mainRef.current) {
        scrollPositions.current[prev] = mainRef.current.scrollTop;
      }
      requestAnimationFrame(() => {
        if (mainRef.current) {
          mainRef.current.scrollTop = scrollPositions.current[curr] || 0;
        }
      });
      prevPathnameRef.current = curr;
    }
  }, [location.pathname, isMobile]);



  // Navigation layout preference - "top" or "side"
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });

  useEffect(() => {
    localStorage.setItem("darkMode", darkMode);
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const [navLayout, setNavLayout] = useState(() => {
    return localStorage.getItem("navLayout") || "top";
  });

  useEffect(() => {
    localStorage.setItem("navLayout", navLayout);
  }, [navLayout]);

  // Handle Ctrl+Click for multi-page view — disabled on mobile
  const handleNavClick = (e, item) => {
    if (!isMobile && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const pageName = item.url.split('/').pop();
      addPage(pageName, item.title);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      setIsCollapsed(isFullscreen);
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

  const isRootRoute = ROOT_ROUTES.includes(location.pathname) || location.pathname === "/";
  const shouldShowNav = !isCollapsed || isHovered;
  const isSideNav = navLayout === "side" && !isCollapsed && !isMobile;

  return (
    <>
      <style>{`
                ${getFullscreenStyles(isCollapsed)}
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

        body {
          overscroll-behavior: none;
        }

        /* Dark mode overrides for clay/custom styles */
        .dark body,
        .dark #root {
          background: #1a1a2e !important;
          color: #e2e8f0;
        }

        .dark .clay-card {
          background: linear-gradient(145deg, rgba(40, 40, 60, 0.95), rgba(30, 30, 50, 0.9)) !important;
          box-shadow:
            8px 8px 20px rgba(0, 0, 0, 0.4),
            -8px -8px 20px rgba(255, 255, 255, 0.03),
            inset 2px 2px 8px rgba(255, 255, 255, 0.05),
            inset -2px -2px 8px rgba(0, 0, 0, 0.3) !important;
        }

        .dark .clay-button {
          box-shadow:
            4px 4px 12px rgba(0, 0, 0, 0.4),
            -4px -4px 12px rgba(255, 255, 255, 0.03),
            inset 1px 1px 4px rgba(255, 255, 255, 0.05),
            inset -1px -1px 4px rgba(0, 0, 0, 0.2) !important;
        }

        button, a {
          user-select: none;
          -webkit-user-select: none;
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
          padding-top: env(safe-area-inset-top);
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

        .mobile-bottom-nav {
          padding-bottom: env(safe-area-inset-bottom);
        }

        .main-content-mobile {
          padding-bottom: calc(64px + env(safe-area-inset-bottom));
        }

        .main-scroll-container {
          overscroll-behavior: none;
        }

        /* ── Mobile global enhancements ── */
        @media (max-width: 767px) {
          /* Inputs: 16px prevents iOS auto-zoom */
          input[type="text"], input[type="email"], input[type="password"],
          input[type="number"], input[type="search"], input[type="tel"],
          input[type="url"], textarea {
            font-size: 16px !important;
          }
        }
      `}</style>
      
      <div className={`h-full flex ${isSideNav ? 'flex-row' : 'flex-col'}`} style={{ background: darkMode ? '#1a1a2e' : 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
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
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
              backdropFilter: 'blur(10px)',
              boxShadow: '4px 0 20px rgba(0,0,0,0.08)',
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
                      className={`px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-2 border ${
                        isActive ? 'clay-card shadow-lg' : isInSplit ? 'border-purple-200 bg-purple-50' : 'hover:clay-card'
                      }`}
                      style={{ 
                        background: isActive
                          ? `linear-gradient(135deg, ${item.borderColor} 0%, ${item.color} 100%)`
                          : `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.95) 100%)`,
                        borderColor: isActive ? item.borderColor : isInSplit ? '#C4B5FD' : item.borderColor,
                        borderWidth: isActive ? '2px' : '1px',
                      }}
                      title="Ctrl+Click to open in split view"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#3730A3' : isInSplit ? '#7C3AED' : '#6B7280' }} />
                      <span className={`font-medium text-sm ${isActive ? 'text-indigo-900 font-bold' : isInSplit ? 'text-purple-700' : 'text-gray-700'}`}>
                        {item.title}
                      </span>
                      {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                      {item.title === 'Sales Pipeline' && pendingImportCount > 0 && (
                        <span className="ml-auto w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">{pendingImportCount}</span>
                      )}
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
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
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
                        className={`px-2 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap border ${
                          isActive ? 'clay-card shadow-lg scale-105' : isInSplit ? 'border-purple-200 bg-purple-50' : 'hover:clay-card'
                        }`}
                        style={{ 
                          background: isActive
                            ? `linear-gradient(135deg, ${item.borderColor} 0%, ${item.color} 100%)`
                            : `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.95) 100%)`,
                          borderColor: isActive ? item.borderColor : isInSplit ? '#C4B5FD' : item.borderColor,
                          borderWidth: isActive ? '2px' : '1px',
                          transform: isActive ? 'scale(1.07)' : undefined,
                        }}
                        title="Ctrl+Click to open in split view"
                      >
                        <item.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? '#3730A3' : isInSplit ? '#7C3AED' : '#6B7280' }} />
                        <span className={`font-medium text-xs ${isActive ? 'text-indigo-900 font-bold' : isInSplit ? 'text-purple-700' : 'text-gray-700'}`}>
                          {item.title}
                        </span>
                        {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                        {item.title === 'Sales Pipeline' && pendingImportCount > 0 && (
                          <span className="w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">{pendingImportCount}</span>
                        )}
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

        {/* Mobile back button in header area */}
        {isMobile && !isRootRoute && (
          <div className="fixed top-0 left-0 right-0 z-50 flex items-center px-3 bg-white/95 backdrop-blur-sm border-b border-gray-200"
            style={{ height: '48px', paddingTop: 'env(safe-area-inset-top)' }}
          >
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-purple-700 font-medium text-sm min-h-[44px] min-w-[44px] -ml-1"
              style={{ userSelect: 'none' }}
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
          </div>
        )}

        {/* Main content */}
        <main 
          ref={mainRef}
          className={`flex-1 main-scroll-container ${isMobile ? 'main-content-mobile' : ''}`}
          style={{ 
            paddingTop: isMobile ? (isRootRoute ? '0' : '48px') : (isSideNav ? '0' : (isCollapsed ? '16px' : '80px')),
            marginLeft: isSideNav ? '224px' : '0',
            height: '100vh',
            overflow: 'auto'
          }}
        >
          <MultiPageContext.Provider value={{ addPage, removePage, clearPages, isInMultiView, additionalPages }}>
            <MultiPageContainer 
              additionalPages={isMobile ? [] : additionalPages} 
              onRemovePage={removePage}
              onClearAll={clearPages}
            >
              {isMobile ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={location.pathname}
                    initial={{ x: 40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -40, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeInOut' }}
                    style={{ minHeight: '100%' }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              ) : children}
            </MultiPageContainer>
          </MultiPageContext.Provider>
        </main>

        {/* Add Task Dialog */}
        <AddTaskDialog 
          isOpen={showAddTaskDialog} 
          onClose={() => setShowAddTaskDialog(false)} 
        />

        {/* Floating Buttons - hidden in fullscreen and on mobile */}
        {!isCollapsed && !isMobile && (
          <div className="fixed bottom-3 left-3 z-50 flex gap-1 opacity-20 hover:opacity-100 transition-opacity duration-200" style={{ marginLeft: isSideNav ? '224px' : '0' }}>
            {/* Full Screen Toggle */}
            <button
              onClick={toggleFullScreen}
              className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
              style={{ background: 'rgba(191, 219, 254, 0.8)', color: '#1e40af' }}
              title="Toggle Fullscreen"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            {isRegistered && (
              <Link
                to={createPageUrl("FeatureReports")}
                className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
                style={{ background: 'rgba(191, 219, 254, 0.8)', color: '#1e40af' }}
              >
                <Lightbulb className="w-3 h-3" />
                <span>Reports</span>
              </Link>
            )}
            {isUserAdmin(currentUser) && (
              <Link
                to={createPageUrl("AdminSettings")}
                className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
                style={{ background: 'rgba(191, 219, 254, 0.8)', color: '#1e40af' }}
              >
                <Settings className="w-3 h-3" />
                <span>Admin</span>
              </Link>
            )}
            {isRegistered && (
              <Link
                to={createPageUrl("UserSettings")}
                className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
                style={{ background: 'rgba(191, 219, 254, 0.8)', color: '#1e40af' }}
              >
                <User className="w-3 h-3" />
                <span>My Info</span>
              </Link>
            )}
            <div
              className="px-2 py-1 flex items-center gap-1 text-xs rounded-md"
              style={{ background: 'rgba(191, 219, 254, 0.8)' }}
              title="Toggle Dark Mode"
            >
              <DarkModeSwitch
                checked={darkMode}
                onChange={setDarkMode}
                size={16}
              />
            </div>
            {additionalPages.length > 0 && (
              <button
                onClick={clearPages}
                className="px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors"
                style={{ background: 'rgba(254, 202, 202, 0.8)', color: '#991b1b' }}
                title="Clear split view"
              >
                <X className="w-3 h-3" />
                <span>Clear Split</span>
              </button>
            )}
          </div>
        )}

        {/* Mobile Bottom Navigation */}
        {isMobile && (
          <nav
            className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 flex border-t border-gray-200"
            style={{
              background: 'rgba(255,255,255,0.97)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
              height: 'calc(64px + env(safe-area-inset-bottom))',
            }}
          >
            {[
                  { label: 'My Workflow', icon: User, url: createPageUrl('MyWorkflow') },
                  { label: 'Sales', icon: DollarSign, url: createPageUrl('SalesPipeline') },
                  { label: 'Timeclock', icon: Clock, url: createPageUrl('TimeClock') },
                  { label: 'Settings', icon: Settings, url: createPageUrl('UserSettings') },
                ].map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <Link
                      key={item.label}
                      to={item.url}
                      onClick={(e) => {
                        if (isActive) {
                          e.preventDefault();
                          navigate(item.url, { replace: true });
                          window.scrollTo(0, 0);
                        }
                      }}
                      className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
                      style={{ minHeight: '44px', userSelect: 'none', color: isActive ? '#7C3AED' : '#6B7280' }}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </Link>
                  );
                })}
          </nav>
        )}
      </div>
    </>
  );
}

function LayoutContentWrapper({ children }) {
  const { currentUser } = useAuth();
  return (
    <ImportProgressProvider currentUserEmail={currentUser?.email}>
      <LayoutContent>{children}</LayoutContent>
    </ImportProgressProvider>
  );
}

export default function Layout({ children }) {
  return (
    <AuthProvider>
      <LayoutContentWrapper>{children}</LayoutContentWrapper>
    </AuthProvider>
  );
}