import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
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
  Moon,
  Sun,
  Menu,
  X
} from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth/EmailGate";
import GlobalSearch from "@/components/workflow/GlobalSearch";

const navigationItems = [
  { title: "Main Workflow", url: createPageUrl("MainWorkflow"), icon: BarChart3, color: "#E0D4F7" },
  { title: "Sales Pipeline", url: createPageUrl("SalesPipeline"), icon: DollarSign, color: "#B2DFDB" },
  { title: "Estimating", url: createPageUrl("Estimating"), icon: Calculator, color: "#FFF9C4" },
  { title: "Sales", url: createPageUrl("Sales"), icon: DollarSign, color: "#B2DFDB" },
  { title: "Permitting", url: createPageUrl("Permitting"), icon: ClipboardCheck, color: "#FFE4D6" },
  { title: "Design", url: createPageUrl("Design"), icon: Pencil, color: "#D4E9F7" },
  { title: "Production", url: createPageUrl("Production"), icon: Hammer, color: "#C8F4E9" },
  { title: "Fabrication", url: createPageUrl("Fabrication"), icon: Wrench, color: "#FFD6E8" },
  { title: "Installation/Delivery", url: createPageUrl("InstallationDeliver"), icon: Truck, color: "#E0D4F7" },
  { title: "Completed Jobs", url: createPageUrl("CompletedJobs"), icon: CheckCircle2, color: "#C8F4E9" },
  { title: "Order Form", url: createPageUrl("OrderForm"), icon: ClipboardList, color: "#FFE4D6" },
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
  
  .dark-mode .clay-card {
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(22, 33, 62, 0.9)) !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode .clay-button {
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(22, 33, 62, 0.9)) !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode input, .dark-mode textarea, .dark-mode select {
    background-color: #1e293b !important;
    color: #e4e4e7 !important;
    border-color: #475569 !important;
  }
  
  .dark-mode input::placeholder, .dark-mode textarea::placeholder {
    color: #64748b !important;
  }
  
  .dark-mode table {
    background-color: #1e293b !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode thead {
    background-color: #334155 !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode thead th {
    background-color: #334155 !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode tbody tr {
    background-color: #1e293b !important;
    border-color: #475569 !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode tbody tr:hover {
    background-color: #334155 !important;
  }
  
  .dark-mode tbody td {
    border-color: #475569 !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode .bg-white {
    background-color: #1e293b !important;
  }
  
  .dark-mode .bg-gray-50, .dark-mode .bg-gray-100 {
    background-color: #334155 !important;
  }
  
  .dark-mode .text-gray-800, .dark-mode .text-gray-700, .dark-mode .text-gray-600 {
    color: #e4e4e7 !important;
  }
  
  .dark-mode .text-gray-500, .dark-mode .text-gray-400 {
    color: #94a3b8 !important;
  }
  
  .dark-mode .border, .dark-mode .border-b, .dark-mode .border-r {
    border-color: #475569 !important;
  }
  
  .dark-mode .border-gray-200, .dark-mode .border-gray-300 {
    border-color: #475569 !important;
  }
  
  .dark-mode .bg-green-50 {
    background-color: rgba(34, 197, 94, 0.15) !important;
  }
  
  .dark-mode .bg-green-100 {
    background-color: rgba(34, 197, 94, 0.25) !important;
  }
  
  .dark-mode .bg-blue-50 {
    background-color: rgba(59, 130, 246, 0.15) !important;
  }
  
  .dark-mode .bg-orange-50, .dark-mode .bg-yellow-50 {
    background-color: rgba(251, 146, 60, 0.15) !important;
  }
  
  .dark-mode .bg-purple-50 {
    background-color: rgba(168, 85, 247, 0.15) !important;
  }
  
  .dark-mode .bg-red-50 {
    background-color: rgba(239, 68, 68, 0.15) !important;
  }
  
  .dark-mode [data-radix-popper-content-wrapper] > div,
  .dark-mode [role="listbox"],
  .dark-mode [role="dialog"],
  .dark-mode [data-state="open"] {
    background-color: #1e293b !important;
    border-color: #475569 !important;
    color: #e4e4e7 !important;
  }
  
  .dark-mode [role="option"] {
    color: #e4e4e7 !important;
  }
  
  .dark-mode [role="option"]:hover,
  .dark-mode [data-highlighted] {
    background-color: #334155 !important;
  }
  
  .dark-mode .hover\\:bg-gray-50:hover,
  .dark-mode .hover\\:bg-gray-100:hover {
    background-color: #334155 !important;
  }
  
  .dark-mode label {
    color: #e4e4e7 !important;
  }
  
  .dark-mode h1, .dark-mode h2, .dark-mode h3, .dark-mode h4, .dark-mode h5, .dark-mode h6 {
    color: #f1f5f9 !important;
  }
  
  .dark-mode p {
    color: #cbd5e1 !important;
  }
  
  .dark-mode .rounded-lg, .dark-mode .rounded-xl {
    border-color: #475569 !important;
  }
  
  .dark-mode button {
    color: #e4e4e7 !important;
  }
  
  .dark-mode .shadow-lg {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3) !important;
  }

  .dark-mode .clay-card {
    box-shadow: 
      8px 8px 20px rgba(0, 0, 0, 0.3),
      -8px -8px 20px rgba(50, 50, 60, 0.4),
      inset 2px 2px 8px rgba(60, 60, 70, 0.3),
      inset -2px -2px 8px rgba(0, 0, 0, 0.2) !important;
  }

  .dark-mode .clay-button {
    box-shadow: 
      4px 4px 12px rgba(0, 0, 0, 0.3),
      -4px -4px 12px rgba(50, 50, 60, 0.4),
      inset 1px 1px 4px rgba(60, 60, 70, 0.3),
      inset -1px -1px 4px rgba(0, 0, 0, 0.2) !important;
  }
`;

function LayoutContent({ children }) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { currentUser, isRegistered, logout, getUserFirstName, darkMode, toggleDarkMode } = useAuth();

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

  const shouldShowNav = !isCollapsed || isHovered;

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
      `}</style>
      
      <div className={`h-full flex flex-col ${darkMode ? 'dark-mode' : ''}`} style={{ background: darkMode ? '#1a1a2e' : 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        {/* Hover detection area when collapsed */}
        {isCollapsed && (
          <div 
            className="fixed top-0 left-0 right-0 h-4 z-40"
            onMouseEnter={() => setIsHovered(true)}
          />
        )}

        {/* Top Navigation */}
        <nav 
          className={`top-nav fixed top-0 left-0 right-0 z-50 ${isCollapsed ? (isHovered ? 'show' : 'collapsed') : ''}`}
          onMouseLeave={() => isCollapsed && setIsHovered(false)}
          style={{ 
            background: darkMode ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(22, 33, 62, 0.95) 100%)' : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
          }}
        >
          <div className="px-4 py-2">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="clay-card px-3 py-2 flex items-center gap-2 sm:gap-3 sm:px-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center" 
                  style={{ 
                    background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)',
                    boxShadow: 'inset 2px 2px 6px rgba(255,255,255,0.7), inset -2px -2px 6px rgba(0,0,0,0.1)'
                  }}>
                  <Home className="w-4 h-4 sm:w-5 sm:h-5 text-purple-700" />
                </div>
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
              <div className="hidden lg:flex items-center gap-1 flex-wrap flex-1 ml-4">
                {navigationItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <Link
                      key={item.title}
                      to={item.url}
                      className={`px-2 py-1.5 rounded-xl transition-all duration-300 flex items-center gap-1 whitespace-nowrap ${
                        isActive ? 'clay-card' : 'hover:clay-card'
                      }`}
                      style={isActive ? { 
                        background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.9) 100%)` 
                      } : {}}
                    >
                      <item.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? '#6B46C1' : '#9CA3AF' }} />
                      <span className={`font-medium text-xs ${isActive ? 'text-purple-900' : 'text-gray-600'}`}>
                        {item.title}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {/* Global Search */}
              <div className="hidden lg:flex">
                <GlobalSearch />
              </div>
            </div>

            {/* Mobile Navigation Menu */}
            {mobileMenuOpen && (
              <div className="lg:hidden mt-2 pb-2 border-t border-gray-200 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  {navigationItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <Link
                        key={item.title}
                        to={item.url}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`px-3 py-2 rounded-xl transition-all duration-300 flex items-center gap-2 ${
                          isActive ? 'clay-card' : 'hover:bg-gray-100'
                        }`}
                        style={isActive ? { 
                          background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.9) 100%)` 
                        } : {}}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#6B46C1' : '#9CA3AF' }} />
                        <span className={`font-medium text-sm ${isActive ? 'text-purple-900' : 'text-gray-600'}`}>
                          {item.title}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Main content with top padding - reduced in fullscreen */}
        <main 
          className="flex-1 overflow-auto main-scroll-container" 
          style={{ paddingTop: isCollapsed ? '16px' : '100px' }}
        >
          {children}
        </main>

        {/* Floating Buttons - hidden in fullscreen */}
                    {!isCollapsed && (
                                      <div className="fixed bottom-4 left-4 z-50 flex gap-2">
                                        {/* Dark Mode Toggle */}
                                        <button
                                          onClick={toggleDarkMode}
                                          className="clay-button px-4 py-2 flex items-center gap-2 text-gray-700 hover:text-purple-700 transition-colors"
                                          style={{ 
                                            background: darkMode 
                                              ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(22, 33, 62, 0.9) 100%)'
                                              : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,240,240,0.9) 100%)'
                                          }}
                                        >
                                          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                        </button>
                                        {isRegistered && (
                                          <Link
                                            to={createPageUrl("FeatureReports")}
                                            className="clay-button px-4 py-2 flex items-center gap-2 text-gray-700 hover:text-purple-700 transition-colors"
                                            style={{ 
                                              background: darkMode 
                                                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(22, 33, 62, 0.9) 100%)'
                                                : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,240,240,0.9) 100%)'
                                            }}
                                          >
                                            <Lightbulb className="w-4 h-4" />
                                            <span className="text-sm font-medium">Reports</span>
                                          </Link>
                                        )}
                                        {isUserAdmin(currentUser) && (
                                          <Link
                                            to={createPageUrl("AdminSettings")}
                                            className="clay-button px-4 py-2 flex items-center gap-2 text-gray-700 hover:text-purple-700 transition-colors"
                                            style={{ 
                                              background: darkMode 
                                                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(22, 33, 62, 0.9) 100%)'
                                                : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,240,240,0.9) 100%)'
                                            }}
                                          >
                                            <Settings className="w-4 h-4" />
                                            <span className="text-sm font-medium">Admin</span>
                                          </Link>
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