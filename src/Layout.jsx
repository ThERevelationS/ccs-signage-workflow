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
  Lightbulb
} from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth/EmailGate";

const navigationItems = [
  { title: "Main Workflow", url: createPageUrl("MainWorkflow"), icon: BarChart3, color: "#E0D4F7" },
  { title: "Estimating", url: createPageUrl("Estimating"), icon: Calculator, color: "#FFF9C4" },
  { title: "Sales", url: createPageUrl("Sales"), icon: DollarSign, color: "#B2DFDB" },
  { title: "Permitting", url: createPageUrl("Permitting"), icon: ClipboardCheck, color: "#FFE4D6" },
  { title: "Design", url: createPageUrl("Design"), icon: Pencil, color: "#D4E9F7" },
  { title: "Production", url: createPageUrl("Production"), icon: Hammer, color: "#C8F4E9" },
  { title: "Fabrication", url: createPageUrl("Fabrication"), icon: Wrench, color: "#FFD6E8" },
  { title: "Installation/Delivery", url: createPageUrl("InstallationDeliver"), icon: Truck, color: "#E0D4F7" },
  { title: "Completed Jobs", url: createPageUrl("CompletedJobs"), icon: CheckCircle2, color: "#C8F4E9" },
];

const adminItems = [
  { title: "Admin Settings", url: createPageUrl("AdminSettings"), icon: Settings, color: "#FFE4D6" },
];

const isUserAdmin = (user) => {
  return user?.role === "admin";
};

function LayoutContent({ children }) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { currentUser, isRegistered, logout, getUserFirstName } = useAuth();

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsCollapsed(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const shouldShowNav = !isCollapsed || isHovered;

  return (
    <>
      <style>{`
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
      
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
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
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
          }}
        >
          <div className="px-4 py-2">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="clay-card px-4 py-2 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" 
                  style={{ 
                    background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)',
                    boxShadow: 'inset 2px 2px 6px rgba(255,255,255,0.7), inset -2px -2px 6px rgba(0,0,0,0.1)'
                  }}>
                  <Home className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800 text-lg leading-tight">Sign Shop</h2>
                  <p className="text-xs text-gray-500">Workflow Manager</p>
                </div>
              </div>

              {/* Navigation Links */}
              <div className="flex items-center gap-2">
                {navigationItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <Link
                      key={item.title}
                      to={item.url}
                      className={`px-4 py-2 rounded-2xl transition-all duration-300 flex items-center gap-2 ${
                        isActive ? 'clay-card' : 'hover:clay-card'
                      }`}
                      style={isActive ? { 
                        background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.9) 100%)` 
                      } : {}}
                    >
                      <item.icon className="w-4 h-4" style={{ color: isActive ? '#6B46C1' : '#9CA3AF' }} />
                      <span className={`font-medium text-sm ${isActive ? 'text-purple-900' : 'text-gray-600'}`}>
                        {item.title}
                      </span>
                    </Link>
                  );
                })}
                {isUserAdmin(currentUser) && (
                                      <>
                                        <div className="w-px h-6 bg-gray-300 mx-2" />
                                        {adminItems.map((item) => {
                                          const isActive = location.pathname === item.url;
                                          return (
                                            <Link
                                              key={item.title}
                                              to={item.url}
                                              className={`px-3 py-2 rounded-2xl transition-all duration-300 flex items-center gap-2 ${
                                                isActive ? 'clay-card' : 'hover:clay-card'
                                              }`}
                                              style={isActive ? { 
                                                background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.9) 100%)` 
                                              } : {}}
                                            >
                                              <item.icon className="w-4 h-4" style={{ color: isActive ? '#6B46C1' : '#9CA3AF' }} />
                                            </Link>
                                          );
                                        })}
                                      </>
                                    )}
                
                {/* User Info */}
                <div className="w-px h-6 bg-gray-300 mx-2" />
                <div className="flex items-center gap-2">
                  <div className="clay-card px-3 py-1.5 flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {getUserFirstName() || currentUser?.email?.split('@')[0] || 'Guest'}
                    </span>
                    {!isRegistered && (
                      <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">View Only</span>
                    )}
                  </div>
                  <button
                    onClick={logout}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                    title="Switch User"
                  >
                    <LogOut className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main content with top padding */}
        <main className="flex-1" style={{ paddingTop: '100px' }}>
          {children}
        </main>

        {/* Floating Buttons - hidden in fullscreen */}
                    {!isCollapsed && (
                      <div className="fixed bottom-4 left-4 z-50 flex gap-2">
                        {isRegistered && (
                          <Link
                            to={createPageUrl("FeatureReports")}
                            className="clay-button px-4 py-2 flex items-center gap-2 text-gray-700 hover:text-purple-700 transition-colors"
                            style={{ 
                              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,240,240,0.9) 100%)'
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
                              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,240,240,0.9) 100%)'
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