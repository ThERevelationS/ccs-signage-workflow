import { useState, useEffect, createContext, useContext, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  ClipboardCheck, 
  Pencil, 
  Hammer, 
  Wrench, 
  Truck, 
  BarChart3,
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
  Navigation as NavigationIcon,
  Calendar,
  Maximize2,
  PanelLeft,
  PanelTop,
  Columns,
  ChevronLeft,
  Clock,
  Megaphone,
  LogIn,
  GitBranch,
  Minimize2,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ChevronsDown,
} from "lucide-react";
import { DarkModeSwitch } from "react-toggle-dark-mode";
import { AuthProvider, useAuth } from "@/components/auth/EmailGate";
import LoginGate from "@/components/auth/LoginGate";
import GlobalSearch from "@/components/workflow/GlobalSearch";
import AddTaskDialog from "@/components/workflow/AddTaskDialog";
import { MultiPageContainer, useMultiPageView } from "@/components/layout/MultiPageView";
import { ImportProgressProvider } from "@/components/shared/ImportProgressContext";
import { ResearchProgressProvider } from "@/components/permitting/ResearchProgressContext";
import { MultiImportProvider } from "@/components/shared/MultiImportContext";
import ResearchProgressBar from "@/components/permitting/ResearchProgressBar";
import AnnouncementManager from "@/components/announcements/AnnouncementManager";
import { AnnouncementProvider } from "@/components/announcements/AnnouncementContext";
import AnnouncementBanner from "@/components/announcements/AnnouncementBanner";
import WorkPauseOverlay from "@/components/timeclock/WorkPauseOverlay";
import FocusPausePair from "@/components/timeclock/FocusPausePair";
import SmartsheetSyncWidget from "@/components/admin/SmartsheetSyncWidget";

// Context for multi-page view
const MultiPageContext = createContext(null);
export const useMultiPage = () => useContext(MultiPageContext);

const navigationItems = [
  { title: "My Workflow", url: createPageUrl("MyWorkflow"), icon: User, accent: "#A78BFA" },
  { title: "Main Workflow", url: createPageUrl("MainWorkflow"), icon: BarChart3, accent: "#38BDF8" },
  { title: "Sales Pipeline", url: createPageUrl("SalesPipeline"), icon: DollarSign, accent: "#2DD4BF" },
  { title: "Estimating", url: createPageUrl("Estimating"), icon: Calculator, accent: "#FBBF24" },
  { title: "Permitting", url: createPageUrl("Permitting"), icon: ClipboardCheck, accent: "#FB7185" },
  { title: "Design", url: createPageUrl("Design"), icon: Pencil, accent: "#60A5FA" },
  { title: "Production", url: createPageUrl("Production"), icon: Hammer, accent: "#4ADE80" },
  { title: "Fabrication", url: createPageUrl("Fabrication"), icon: Wrench, accent: "#C084FC" },
  { title: "Installation/Delivery", url: createPageUrl("InstallationDeliver"), icon: Truck, accent: "#FB923C" },
  { title: "Order Form", url: createPageUrl("OrderForm"), icon: ClipboardList, accent: "#34D399" },
  { title: "Estimator", url: createPageUrl("Estimator"), icon: Calculator, accent: "#F87171" },
  { title: "Fleet", url: createPageUrl("FleetOverview"), icon: NavigationIcon, accent: "#22D3EE" },
];

const meetingsDropdownItems = [
  { title: "SIPs", url: createPageUrl("SIPs"), icon: ClipboardList, accent: "#FACC15" },
  { title: "Monday Meeting", url: createPageUrl("MondayMorningMeeting"), icon: ClipboardList, accent: "#A3E635" },
  { title: "Financials", url: createPageUrl("Financials"), icon: DollarSign, accent: "#3B82F6" },
  { title: "Calendar", url: createPageUrl("WorkOrderCalendar"), icon: Calendar, accent: "#818CF8" },

];



const isUserAdmin = (user) => {
  return user?.role === "admin";
};

const SHELL_SPRING = {
  type: "spring",
  stiffness: 210,
  damping: 30,
  mass: 0.82,
};

const hexToRgbTuple = (hex) => {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return "148 163 184";
  const value = Number.parseInt(normalized, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
};

function ShellViewControls({
  compactView,
  onToggleCompact,
  collapsed,
  onToggleCollapsed,
  navLayout,
} = {}) {
  const CollapseIcon = navLayout === "side"
    ? (collapsed ? ChevronsRight : ChevronsLeft)
    : (collapsed ? ChevronsDown : ChevronsUp);

  return (
    <div
      data-shell-view-controls
      className={`ccs-glass-strip mt-1 flex items-center gap-0.5 rounded-xl ${compactView ? "h-[17px] p-px" : "h-[20px] p-px"}`}
    >
      <motion.button
        type="button"
        data-shell-compact-toggle
        onClick={onToggleCompact}
        aria-pressed={compactView}
        title={compactView ? "Return navigation to comfortable spacing" : "Use compact navigation spacing"}
        className={`flex h-full min-w-0 flex-1 items-center justify-center rounded-lg font-bold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${compactView ? "gap-0.5 px-1 text-[8px]" : "gap-1 px-1.5 text-[9px]"} ${compactView
          ? "bg-violet-400/20 text-violet-100 shadow-inner"
          : "text-slate-200 hover:bg-white/10"}`}
        whileHover={{ y: -1, scale: 1.025 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.12 }}
      >
        <Minimize2 className="h-3 w-3" />
        <span>{compactView ? "Roomy" : "Compact"}</span>
      </motion.button>
      <motion.button
        type="button"
        data-shell-collapse-toggle
        onClick={onToggleCollapsed}
        aria-pressed={collapsed}
        title={collapsed ? "Pin navigation open" : "Collapse navigation; hover the screen edge to peek"}
        className={`flex h-full min-w-0 flex-1 items-center justify-center rounded-lg font-bold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${compactView ? "gap-0.5 px-1 text-[8px]" : "gap-1 px-1.5 text-[9px]"} ${collapsed
          ? "bg-cyan-400/15 text-cyan-100 shadow-inner"
          : "text-slate-200 hover:bg-white/10"}`}
        whileHover={{ y: -1, scale: 1.025 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.12 }}
      >
        <CollapseIcon className="h-3 w-3" />
        <span>{collapsed ? "Pin" : "Collapse"}</span>
      </motion.button>
    </div>
  );
}

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
  const reduceMotion = useReducedMotion();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem("ccsShellCollapsed") === "true");
  const [compactView, setCompactView] = useState(() => localStorage.getItem("ccsShellCompact") === "true");
  const [isHovered, setIsHovered] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [meetingsDropdownOpen, setMeetingsDropdownOpen] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showAnnouncementManager, setShowAnnouncementManager] = useState(false);
  const { currentUser, sessionToken, isRegistered, logout, getUserFirstName, showLoginDialog } = useAuth();
  
  // Multi-page view state
  const { additionalPages, addPage, removePage, clearPages, isInMultiView } = useMultiPageView();
  
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
  const topNavRef = useRef(null);
  const [topNavHeight, setTopNavHeight] = useState(120);
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
    setIsHovered(false);
  }, [navLayout]);

  useEffect(() => {
    localStorage.setItem("ccsShellCollapsed", navCollapsed ? "true" : "false");
  }, [navCollapsed]);

  useEffect(() => {
    localStorage.setItem("ccsShellCompact", compactView ? "true" : "false");
  }, [compactView]);

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
      const nextFullscreen = !!document.fullscreenElement;
      setIsFullscreen(nextFullscreen);
      setIsHovered(false);
      if (nextFullscreen) {
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
  const isSideNav = navLayout === "side" && !isMobile;
  const effectiveCollapsed = (navCollapsed || isFullscreen) && !isMobile;
  const sideNavWidth = compactView ? 158 : 224;
  const collapsedRail = 10;
  const shellTransition = reduceMotion ? { duration: 0.01 } : SHELL_SPRING;

  useEffect(() => {
    if (isMobile || isSideNav) return undefined;
    const node = topNavRef.current;
    if (!node) return undefined;

    const updateTopNavHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      if (nextHeight > 0) setTopNavHeight(nextHeight);
    };

    updateTopNavHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTopNavHeight);
      return () => window.removeEventListener("resize", updateTopNavHeight);
    }

    const observer = new ResizeObserver(updateTopNavHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isMobile, isSideNav]);

  useEffect(() => {
    if (!effectiveCollapsed) return undefined;

    const trackCollapsedShellPointer = (event) => {
      const target = event.target;
      const insideShell = target instanceof Element && Boolean(
        target.closest(".top-nav, .side-nav, [data-shell-navigation-handle]")
      );
      const onEdge = navLayout === "side"
        ? event.clientX <= collapsedRail + 8
        : event.clientY <= collapsedRail + 8;
      const nextHovered = insideShell || onEdge;
      setIsHovered((previous) => previous === nextHovered ? previous : nextHovered);
    };

    window.addEventListener("pointermove", trackCollapsedShellPointer, { passive: true });
    return () => window.removeEventListener("pointermove", trackCollapsedShellPointer);
  }, [effectiveCollapsed, navLayout]);

  return (
    <>
      <style>{`
                ${getFullscreenStyles(isFullscreen)}
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

        /* Dark mode CSS variable overrides */
        .dark {
          --background: 231 39% 10%;
          --foreground: 210 40% 92%;
          --card: 231 35% 13%;
          --card-foreground: 210 40% 92%;
          --popover: 231 35% 13%;
          --popover-foreground: 210 40% 92%;
          --primary: 210 40% 92%;
          --primary-foreground: 231 39% 10%;
          --secondary: 231 30% 18%;
          --secondary-foreground: 210 40% 92%;
          --muted: 231 30% 18%;
          --muted-foreground: 215 20% 60%;
          --accent: 231 30% 20%;
          --accent-foreground: 210 40% 92%;
          --destructive: 0 62.8% 40%;
          --destructive-foreground: 0 0% 98%;
          --border: 231 30% 22%;
          --input: 231 30% 18%;
          --ring: 215 60% 60%;
        }

        /* Dark mode overrides for clay/custom styles */
        .dark body,
        .dark #root {
          background: #131929 !important;
          color: #e2e8f0 !important;
        }

        .dark .clay-card {
          background: linear-gradient(145deg, rgba(40, 44, 68, 0.95), rgba(30, 33, 55, 0.9)) !important;
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

        /* General dark mode overrides */
        .dark input,
        .dark textarea {
          background-color: hsl(231, 35%, 16%) !important;
          color: hsl(210, 40%, 92%) !important;
          border-color: hsl(231, 30%, 28%) !important;
        }

        .dark th {
          background-color: hsl(231, 35%, 15%) !important;
          color: hsl(210, 40%, 85%) !important;
          border-color: hsl(231, 30%, 22%) !important;
        }

        .dark td {
          border-color: hsl(231, 30%, 22%) !important;
        }

        .dark .bg-white {
          background-color: hsl(231, 35%, 13%) !important;
          color: hsl(210, 40%, 92%) !important;
        }

        .dark [class*="bg-white"] {
          background-color: hsl(231, 35%, 13%) !important;
        }

        .dark [class*="bg-gray-50"] {
          background-color: hsl(231, 35%, 11%) !important;
        }

        .dark [class*="bg-gray-100"] {
          background-color: hsl(231, 35%, 15%) !important;
        }

        .dark [class*="bg-gray-200"] {
          background-color: hsl(231, 30%, 20%) !important;
        }

        .dark [class*="text-gray-900"],
        .dark [class*="text-gray-800"] {
          color: hsl(210, 40%, 88%) !important;
        }

        .dark [class*="text-gray-700"],
        .dark [class*="text-gray-600"] {
          color: hsl(215, 20%, 65%) !important;
        }

        .dark [class*="text-gray-500"],
        .dark [class*="text-gray-400"] {
          color: hsl(215, 20%, 55%) !important;
        }

        .dark [class*="border-gray-100"],
        .dark [class*="border-gray-200"],
        .dark [class*="border-gray-300"] {
          border-color: hsl(231, 30%, 25%) !important;
        }

        .dark [class*="divide-gray"] > * + * {
          border-color: hsl(231, 30%, 25%) !important;
        }

        .dark [style*="background: white"],
        .dark [style*="background: #fff"],
        .dark [style*="background: #ffffff"],
        .dark [style*="background-color: white"],
        .dark [style*="background-color: #fff"],
        .dark [style*="background-color: #ffffff"] {
          background: hsl(231, 35%, 13%) !important;
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

        /* Smoked crystal navigation: layered translucency, edge highlights and color refraction. */
        .ccs-glass-shell {
          --glass-accent-rgb: 148 163 184;
          isolation: isolate;
          color: #f8fafc;
          background:
            radial-gradient(circle at 14% -12%, rgba(255,255,255,0.24), transparent 28%),
            radial-gradient(circle at 86% 118%, rgba(125,211,252,0.12), transparent 34%),
            linear-gradient(142deg, rgba(51,65,85,0.82) 0%, rgba(71,85,105,0.66) 42%, rgba(30,41,59,0.76) 100%);
          border: 1px solid rgba(255,255,255,0.34);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.56),
            inset 1px 0 0 rgba(255,255,255,0.14),
            inset 0 -1px 0 rgba(15,23,42,0.38),
            0 20px 52px rgba(15,23,42,0.28),
            0 5px 18px rgba(15,23,42,0.18);
          backdrop-filter: blur(34px) saturate(185%) contrast(112%);
          -webkit-backdrop-filter: blur(34px) saturate(185%) contrast(112%);
        }

        .ccs-glass-shell::before,
        .ccs-glass-shell::after {
          content: "";
          position: absolute;
          pointer-events: none;
          z-index: -1;
        }

        .ccs-glass-shell::before {
          inset: 0;
          background:
            linear-gradient(112deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 22%, transparent 40%, transparent 70%, rgba(255,255,255,0.07) 100%);
        }

        .ccs-glass-shell::after {
          left: 1px;
          right: 1px;
          top: 1px;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.78) 18%, rgba(255,255,255,0.28) 72%, transparent 100%);
          opacity: 0.72;
        }

        .ccs-glass-panel,
        .ccs-glass-strip {
          color: #f8fafc;
          background:
            radial-gradient(circle at 18% 0%, rgba(255,255,255,0.17), transparent 30%),
            linear-gradient(145deg, rgba(100,116,139,0.38), rgba(30,41,59,0.32));
          border: 1px solid rgba(255,255,255,0.25);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.42),
            inset 0 -1px 0 rgba(15,23,42,0.30),
            0 7px 18px rgba(15,23,42,0.18);
          backdrop-filter: blur(22px) saturate(160%);
          -webkit-backdrop-filter: blur(22px) saturate(160%);
        }

        .ccs-glass-control,
        .ccs-glass-nav-item {
          --glass-accent-rgb: 148 163 184;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          color: #f8fafc;
          background:
            radial-gradient(circle at 16% -12%, rgba(255,255,255,0.18), transparent 34%),
            linear-gradient(145deg, rgb(var(--glass-accent-rgb) / 0.24) 0%, rgba(30,41,59,0.42) 58%, rgba(15,23,42,0.50) 100%) !important;
          border: 1px solid rgb(var(--glass-accent-rgb) / 0.48) !important;
          backdrop-filter: blur(20px) saturate(170%);
          -webkit-backdrop-filter: blur(20px) saturate(170%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.42),
            inset 1px 0 0 rgba(255,255,255,0.10),
            inset 0 -1px 0 rgba(15,23,42,0.32),
            0 7px 18px rgba(15,23,42,0.20) !important;
          transition:
            transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
            border-color 180ms ease,
            box-shadow 180ms ease,
            filter 180ms ease !important;
        }

        .ccs-glass-control::before,
        .ccs-glass-nav-item::before {
          content: "";
          position: absolute;
          inset: 1px;
          z-index: 0;
          pointer-events: none;
          border-radius: inherit;
          background:
            linear-gradient(118deg, rgba(255,255,255,0.16) 0%, transparent 26%, transparent 68%, rgba(255,255,255,0.05) 100%);
        }

        .ccs-glass-control > *,
        .ccs-glass-nav-item > * {
          position: relative;
          z-index: 1;
        }

        .ccs-glass-control:hover,
        .ccs-glass-nav-item:hover {
          transform: translateY(-1px);
          border-color: rgb(var(--glass-accent-rgb) / 0.72) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.56),
            inset 0 -1px 0 rgba(15,23,42,0.26),
            0 10px 24px rgba(15,23,42,0.26),
            0 0 18px rgb(var(--glass-accent-rgb) / 0.14) !important;
          filter: saturate(1.08) brightness(1.06);
        }

        .ccs-glass-control:active,
        .ccs-glass-nav-item:active {
          transform: translateY(0) scale(0.985);
        }

        .ccs-glass-purple { --glass-accent-rgb: 167 139 250; }
        .ccs-glass-red { --glass-accent-rgb: 248 113 113; }
        .ccs-glass-green { --glass-accent-rgb: 74 222 128; }
        .ccs-glass-blue { --glass-accent-rgb: 96 165 250; }
        .ccs-glass-cyan { --glass-accent-rgb: 34 211 238; }
        .ccs-glass-neutral { --glass-accent-rgb: 148 163 184; }

        .ccs-focus-pause-glass {
          --glass-accent-rgb: 167 139 250;
          background:
            radial-gradient(circle at 12% -10%, rgba(255,255,255,0.20), transparent 32%),
            linear-gradient(90deg, rgba(139,92,246,0.30) 0%, rgba(91,33,182,0.20) 49.7%, rgba(20,184,166,0.22) 50.3%, rgba(13,148,136,0.28) 100%),
            linear-gradient(145deg, rgba(30,41,59,0.50), rgba(15,23,42,0.56)) !important;
          border-color: rgba(196,181,253,0.46) !important;
        }

        .ccs-navigation-handle {
          color: #f8fafc;
          background:
            radial-gradient(circle at 20% -20%, rgba(255,255,255,0.22), transparent 36%),
            linear-gradient(145deg, rgba(71,85,105,0.86), rgba(30,41,59,0.78));
          border: 1px solid rgba(255,255,255,0.34);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.52),
            inset 0 -1px 0 rgba(15,23,42,0.34),
            0 12px 30px rgba(15,23,42,0.32);
          backdrop-filter: blur(26px) saturate(175%);
          -webkit-backdrop-filter: blur(26px) saturate(175%);
        }

        .dark .ccs-glass-shell {
          background:
            radial-gradient(circle at 14% -12%, rgba(255,255,255,0.12), transparent 28%),
            radial-gradient(circle at 84% 116%, rgba(124,58,237,0.10), transparent 34%),
            linear-gradient(145deg, rgba(20,27,48,0.84) 0%, rgba(17,24,39,0.76) 48%, rgba(8,13,28,0.82) 100%);
          border-color: rgba(255,255,255,0.17);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.16),
            inset 0 -1px 0 rgba(0,0,0,0.32),
            0 20px 56px rgba(0,0,0,0.44),
            0 6px 22px rgba(76,29,149,0.12);
        }

        .dark .ccs-glass-panel,
        .dark .ccs-glass-strip {
          background:
            radial-gradient(circle at 18% 0%, rgba(255,255,255,0.10), transparent 30%),
            linear-gradient(145deg, rgba(71,85,105,0.28), rgba(15,23,42,0.38)) !important;
          border-color: rgba(255,255,255,0.15) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.16),
            0 8px 22px rgba(0,0,0,0.30) !important;
        }

        .dark .ccs-glass-control,
        .dark .ccs-glass-nav-item {
          background:
            radial-gradient(circle at 16% -12%, rgba(255,255,255,0.12), transparent 34%),
            linear-gradient(145deg, rgb(var(--glass-accent-rgb) / 0.30) 0%, rgba(15,23,42,0.46) 58%, rgba(2,6,23,0.56) 100%) !important;
          border-color: rgb(var(--glass-accent-rgb) / 0.58) !important;
        }

        .dark .ccs-focus-pause-glass {
          background:
            radial-gradient(circle at 12% -10%, rgba(255,255,255,0.12), transparent 32%),
            linear-gradient(90deg, rgba(139,92,246,0.34) 0%, rgba(76,29,149,0.22) 49.7%, rgba(20,184,166,0.24) 50.3%, rgba(15,118,110,0.32) 100%),
            linear-gradient(145deg, rgba(15,23,42,0.62), rgba(2,6,23,0.68)) !important;
          border-color: rgba(196,181,253,0.42) !important;
        }

        .top-nav {
          padding-top: env(safe-area-inset-top);
          will-change: transform, opacity;
        }

        .side-nav {
          will-change: transform, opacity, width;
        }

        @media (prefers-reduced-motion: reduce) {
          .ccs-glass-control,
          .ccs-glass-nav-item {
            transition-duration: 1ms !important;
          }
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
          
          /* Hide top nav on mobile */
          .top-nav {
            display: none !important;
          }
        }
      `}</style>
      
      <div className={`h-full flex ${isSideNav ? 'flex-row' : 'flex-col'}`} style={{ background: darkMode ? '#1a1a2e' : 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        <WorkPauseOverlay />
        {/* Collapsed shell keeps a narrow edge target and a visible glass handle. */}
        {effectiveCollapsed && (
          <div
            data-shell-hover-rail
            className={navLayout === "side"
              ? "fixed bottom-0 left-0 top-0 z-40"
              : "fixed left-0 right-0 top-0 z-40"}
            style={navLayout === "side"
              ? { width: `${collapsedRail + 8}px` }
              : { height: `${collapsedRail + 8}px` }}
            onMouseEnter={() => setIsHovered(true)}
          />
        )}

        <AnimatePresence>
          {effectiveCollapsed && (
            navLayout === "side" ? (
              <motion.button
                key="side-navigation-handle"
                data-shell-navigation-handle="side"
                type="button"
                initial={reduceMotion ? false : { x: -18, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { x: -18, opacity: 0 }}
                transition={shellTransition}
                onMouseEnter={() => setIsHovered(true)}
                onFocus={() => setIsHovered(true)}
                onClick={() => {
                  setNavCollapsed(false);
                  setIsHovered(false);
                }}
                className="ccs-navigation-handle fixed left-0 top-1/2 z-[60] flex h-[132px] w-[30px] items-center justify-center gap-2 rounded-r-2xl text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-100"
                style={{ marginTop: -66 }}
                title="Open Navigation Bar"
                aria-label="Open Navigation Bar"
              >
                <ChevronsRight className="h-3.5 w-3.5 flex-shrink-0" />
                <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Navigation Bar</span>
              </motion.button>
            ) : (
              <motion.button
                key="top-navigation-handle"
                data-shell-navigation-handle="top"
                type="button"
                initial={reduceMotion ? false : { y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { y: -14, opacity: 0 }}
                transition={shellTransition}
                onMouseEnter={() => setIsHovered(true)}
                onFocus={() => setIsHovered(true)}
                onClick={() => {
                  setNavCollapsed(false);
                  setIsHovered(false);
                }}
                className="ccs-navigation-handle fixed left-1/2 top-0 z-[60] flex h-[28px] w-[148px] items-center justify-center gap-1.5 rounded-b-2xl text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-100"
                style={{ marginLeft: -74 }}
                title="Open Navigation Bar"
                aria-label="Open Navigation Bar"
              >
                <ChevronsDown className="h-3.5 w-3.5" />
                <span>Navigation Bar</span>
              </motion.button>
            )
          )}
        </AnimatePresence>

        {/* Side Navigation */}
        {isSideNav && (
          <motion.nav
            initial={false}
            animate={{
              x: effectiveCollapsed && !isHovered ? -(sideNavWidth - collapsedRail) : 0,
              opacity: effectiveCollapsed && !isHovered ? 0.94 : 1,
            }}
            transition={shellTransition}
            className="side-nav ccs-glass-shell fixed bottom-0 left-0 top-0 z-50 flex flex-col overflow-visible"
            style={{ width: sideNavWidth }}
          >
            <div className={compactView ? "p-1.5" : "p-3"}>
              {/* Brand + tiny shell view controls */}
              <div className={compactView ? "mb-1.5" : "mb-4"}>
                <div className={`ccs-glass-panel flex items-center ${compactView ? "gap-1.5 rounded-xl px-1.5 py-1" : "gap-2 rounded-2xl px-3 py-2"}`}>
                  <button
                    onClick={() => setNavLayout(navLayout === "top" ? "side" : "top")}
                    className={`ccs-glass-control ccs-glass-purple flex flex-shrink-0 items-center justify-center text-violet-200 ${compactView ? "h-6 w-6 rounded-lg" : "h-8 w-8 rounded-xl"}`}
                    title="Switch to Top Bar"
                  >
                    <PanelTop className={compactView ? "h-3.5 w-3.5" : "h-4 w-4"} />
                  </button>
                  <div className="min-w-0">
                    <h2 className={`${compactView ? "text-xs" : "text-sm"} truncate font-bold leading-tight text-white`}>Sign Shop</h2>
                    {!compactView && <p className="truncate text-xs text-slate-300">Workflow</p>}
                  </div>
                </div>
                <ShellViewControls
                  compactView={compactView}
                  onToggleCompact={() => setCompactView((value) => !value)}
                  collapsed={navCollapsed}
                  onToggleCollapsed={() => {
                    setNavCollapsed((value) => !value);
                    setIsHovered(false);
                  }}
                  navLayout="side"
                />
              </div>

              {/* Time Clock + Add Task side by side, Search full width below */}
              <div className={`${compactView ? "mb-2 space-y-1" : "mb-4 space-y-2"}`}>
                {/* Login / Logout button */}
                {!currentUser ? (
                  <button
                    data-login-gate-allow
                    onClick={showLoginDialog}
                    className={`ccs-glass-control ccs-glass-purple w-full flex items-center justify-center rounded-xl text-violet-200 ${compactView ? "h-7 gap-1 text-xs" : "h-9 gap-2 text-sm"}`}
                    title="Sign In"
                  >
                    <LogIn className="h-4 w-4 text-violet-300" />
                    <span className="font-bold text-sm text-violet-100">Sign In</span>
                  </button>
                ) : (
                  <button
                    data-login-gate-allow
                    onClick={logout}
                    className={`ccs-glass-control ccs-glass-neutral w-full flex items-center justify-center rounded-xl text-slate-100 ${compactView ? "h-7 gap-1 text-xs" : "h-9 gap-2 text-sm"}`}
                    title={`Logout ${getUserFirstName()}`}
                  >
                    <LogOut className={compactView ? "h-3.5 w-3.5" : "h-4 w-4"} />
                    <span className={`${compactView ? "text-xs" : "text-sm"} truncate font-bold`}>Logout {getUserFirstName()}</span>
                  </button>
                )}

                {currentUser && <FocusPausePair currentUser={currentUser} fullWidth compact={compactView} />}

                {/* Announcement button - admin only, above Time Clock */}
                {isUserAdmin(currentUser) && (
                  <button
                    onClick={() => setShowAnnouncementManager(true)}
                    className={`ccs-glass-control ccs-glass-red w-full flex items-center justify-center rounded-xl text-red-200 ${compactView ? "h-7 gap-1 text-xs" : "h-9 gap-2 text-sm"}`}
                    title="Announcements (Admin)"
                  >
                    <Megaphone className="w-4 h-4 text-red-600" />
                    <span className={`${compactView ? "text-[11px]" : "text-sm"} font-bold`}>Announce</span>
                  </button>
                )}
                <div className={`flex ${compactView ? "gap-1" : "gap-2"}`}>
                  <Link
                    to={createPageUrl("TimeClock")}
                    className={`ccs-glass-control ccs-glass-green flex flex-1 items-center justify-center rounded-xl text-emerald-200 ${compactView ? "h-7 gap-1 px-1.5 text-[11px]" : "gap-2 px-3 py-2 text-sm"}`}
                  >
                    <Home className="w-4 h-4 text-green-600" />
                    <span className={`${compactView ? "text-[11px]" : "text-sm"} font-bold`}>Time Clock</span>
                  </Link>

                  <button
                    onClick={() => setShowAddTaskDialog(true)}
                    className={`ccs-glass-control ccs-glass-blue flex flex-1 items-center justify-center rounded-xl text-blue-200 ${compactView ? "h-7 gap-1 px-1.5 text-[11px]" : "gap-2 px-3 py-2 text-sm"}`}
                  >
                    <ClipboardList className="w-4 h-4 text-blue-600" />
                    <span className={`${compactView ? "text-[11px]" : "text-sm"} font-bold`}>+ Task</span>
                  </button>
                </div>

                <GlobalSearch className="w-full justify-center" compact={compactView} shellGlass />
              </div>
            </div>

            {/* Navigation Links */}
            <div className={`flex-1 overflow-y-auto ${compactView ? "px-1.5 py-1" : "px-3 py-2"}`}>
              <div className={compactView ? "space-y-0.5" : "space-y-1"}>
                {navigationItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  const isInSplit = additionalPages.find(p => item.url.includes(p.name));
                  return (
                    <Link
                      key={item.title}
                      to={item.url}
                      onClick={(e) => handleNavClick(e, item)}
                      className={`ccs-glass-nav-item flex items-center border ${compactView ? "gap-1.5 rounded-lg px-1.5 py-1" : "gap-2 rounded-xl px-3 py-2"} ${
                        isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""
                      }`}
                      style={{ "--glass-accent-rgb": hexToRgbTuple(item.accent) }}
                      title="Ctrl+Click to open in split view"
                    >
                      <item.icon className={`${compactView ? "h-3 w-3" : "h-4 w-4"} flex-shrink-0`} style={{ color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }} />
                      <span className={`${compactView ? "text-[11px]" : "text-sm"} min-w-0 truncate font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`}>
                        {item.title}
                      </span>
                      {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                      </Link>
                      );
                      })}

                      {/* Meetings Section */}
                <div className={`${compactView ? "mt-1 pt-1" : "mt-2 pt-2"} border-t border-gray-200/50 dark:border-white/10`}>
                  <span className={`${compactView ? "px-1.5 text-[10px]" : "px-3 text-xs"} font-medium text-slate-300`}>Meetings</span>
                  {meetingsDropdownItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    const isInSplit = additionalPages.find(p => item.url.includes(p.name));
                    return (
                      <Link
                        key={item.title}
                        to={item.url}
                        onClick={(e) => handleNavClick(e, item)}
                        className={`ccs-glass-nav-item flex items-center border ${compactView ? "gap-1.5 rounded-lg px-1.5 py-1" : "gap-2 rounded-xl px-3 py-2"} ${
                          isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""
                        }`}
                        style={{ "--glass-accent-rgb": hexToRgbTuple(item.accent) }}
                        title="Ctrl+Click to open in split view"
                      >
                        <item.icon className={`${compactView ? "h-3 w-3" : "h-4 w-4"} flex-shrink-0`} style={{ color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }} />
                        <span className={`${compactView ? "text-[11px]" : "text-sm"} min-w-0 truncate font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`}>
                          {item.title}
                        </span>
                        {isInSplit && <Columns className="w-3 h-3 text-purple-500" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.nav>
        )}

        {/* Top Navigation */}
        {!isSideNav && (
          <motion.nav
            ref={topNavRef}
            initial={false}
            animate={{
              y: effectiveCollapsed && !isHovered ? -(topNavHeight - collapsedRail) : 0,
              opacity: effectiveCollapsed && !isHovered ? 0.94 : 1,
            }}
            transition={shellTransition}
            className="top-nav ccs-glass-shell fixed left-0 right-0 top-0 z-50 overflow-visible"
          >
            <div className={compactView ? "px-2 py-1" : "px-4 py-2"}>
              <div className={`flex justify-between ${compactView ? "items-center" : "items-start"}`}>
                {/* Brand + tiny shell view controls */}
                <div className="flex-shrink-0">
                  <div className={`ccs-glass-panel flex items-center ${compactView ? "gap-1.5 rounded-xl px-1.5 py-1" : "gap-2 rounded-2xl px-3 py-2 sm:gap-3 sm:px-4"}`}>
                    <button
                      onClick={() => setNavLayout(navLayout === "top" ? "side" : "top")}
                      className={`ccs-glass-control ccs-glass-purple flex items-center justify-center text-violet-200 ${compactView ? "h-6 w-6 rounded-lg" : "h-8 w-8 rounded-xl sm:h-10 sm:w-10 sm:rounded-2xl"}`}
                      title="Switch to Sidebar"
                    >
                      <PanelLeft className={compactView ? "h-3.5 w-3.5" : "h-4 w-4 sm:h-5 sm:w-5"} />
                    </button>
                    <div className="hidden sm:block">
                      <h2 className={`${compactView ? "text-xs" : "text-lg"} font-bold leading-tight text-white`}>Sign Shop</h2>
                      {!compactView && <p className="text-xs text-slate-300">Workflow Manager</p>}
                    </div>
                  </div>
                  <ShellViewControls
                    compactView={compactView}
                    onToggleCompact={() => setCompactView((value) => !value)}
                    collapsed={navCollapsed}
                    onToggleCollapsed={() => {
                      setNavCollapsed((value) => !value);
                      setIsHovered(false);
                    }}
                    navLayout="top"
                  />
                </div>

                {/* Mobile Menu Button */}
                <button 
                  className="lg:hidden clay-button p-3 min-h-[48px] min-w-[48px]"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  title={mobileMenuOpen ? "Close menu" : "Open menu"}
                >
                  {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>

                {/* Desktop Navigation Links */}
                <div className={`hidden lg:flex items-center flex-wrap flex-1 ${compactView ? "ml-2 max-w-[calc(100%-470px)] gap-0.5" : "ml-4 max-w-[calc(100%-400px)] gap-1"}`}>
                  {navigationItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    const isInSplit = additionalPages.find(p => item.url.includes(p.name));
                    return (
                      <Link
                        key={item.title}
                        to={item.url}
                        onClick={(e) => handleNavClick(e, item)}
                        className={`ccs-glass-nav-item flex items-center whitespace-nowrap border ${compactView ? "gap-1 rounded-lg px-1 py-0.5" : "gap-1.5 rounded-lg px-2 py-1.5"} ${
                          isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""
                        }`}
                        style={{ "--glass-accent-rgb": hexToRgbTuple(item.accent) }}
                        title="Ctrl+Click to open in split view"
                      >
                        <item.icon className={`${compactView ? "h-3 w-3" : "h-3.5 w-3.5"} flex-shrink-0`} style={{ color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }} />
                        <span className={`${compactView ? "text-[10px]" : "text-xs"} font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`}>
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
                      className={`ccs-glass-nav-item flex items-center whitespace-nowrap border ${compactView ? "gap-1 rounded-lg px-1 py-0.5" : "gap-1.5 rounded-lg px-2 py-1.5"}`}
                      style={{ "--glass-accent-rgb": hexToRgbTuple("#FACC15") }}
                    >
                      <Calendar className={`${compactView ? "h-3 w-3" : "h-3.5 w-3.5"} flex-shrink-0`} style={{ color: "#FACC15" }} />
                      <span className={`${compactView ? "text-[10px]" : "text-xs"} font-medium text-slate-100`}>
                        Meetings
                      </span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${meetingsDropdownOpen ? 'rotate-180' : ''}`} style={{ color: meetingsDropdownItems.some(item => location.pathname === item.url) ? '#6B46C1' : '#9CA3AF' }} />
                    </button>
                    
                    {meetingsDropdownOpen && (
                      <div className="ccs-glass-panel absolute left-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl p-1 text-slate-700 dark:text-slate-100">
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
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                                isActive || isInSplit ? 'bg-violet-100/45 dark:bg-violet-400/10' : 'hover:bg-white/40 dark:hover:bg-white/5'
                              }`}
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

                {/* Utility controls stay within the same glass material as the navigation shell. */}
                <div className={`hidden lg:flex ${compactView ? "flex-row items-center gap-1" : "flex-col gap-1"}`}>
                  <div className={`flex items-stretch ${compactView ? "gap-1" : "gap-2"}`}>
                    {/* Login / Logout button */}
                    {!currentUser ? (
                      <button
                        data-login-gate-allow
                        onClick={showLoginDialog}
                        className={`ccs-glass-control flex items-center rounded-xl text-purple-800 dark:text-violet-100 ${compactView ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`}
                        title="Sign In"
                      >
                        <LogIn className={compactView ? "h-3.5 w-3.5" : "h-4 w-4"} />
                        <span className={`${compactView ? "text-[11px]" : "text-sm"} font-bold`}>Sign In</span>
                      </button>
                    ) : (
                      <button
                        data-login-gate-allow
                        onClick={logout}
                        className={`ccs-glass-control flex items-center rounded-xl text-slate-700 dark:text-slate-100 ${compactView ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`}
                        title={`Logout ${getUserFirstName()}`}
                      >
                        <LogOut className={compactView ? "h-3.5 w-3.5" : "h-4 w-4"} />
                        <span className={`${compactView ? "text-[11px]" : "text-sm"} font-bold`}>Logout</span>
                      </button>
                    )}

                    {currentUser && <FocusPausePair currentUser={currentUser} compact={compactView} />}

                    {/* Announcement button - admin only, square, two rows tall */}
                    {isUserAdmin(currentUser) && (
                      <button
                        onClick={() => setShowAnnouncementManager(true)}
                        className={`ccs-glass-control flex flex-shrink-0 items-center justify-center rounded-xl text-red-700 dark:text-red-200 ${compactView ? "h-7 w-8" : "w-11 self-stretch"}`}
                        title="Announcements (Admin)"
                      >
                        <Megaphone className={compactView ? "h-3.5 w-3.5" : "h-5 w-5"} />
                      </button>
                    )}
                    <Link
                      to={createPageUrl("TimeClock")}
                      className={`ccs-glass-control flex items-center rounded-xl text-green-700 dark:text-emerald-200 ${compactView ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`}
                    >
                      <Home className={compactView ? "h-3.5 w-3.5" : "h-4 w-4"} />
                      <span className={`${compactView ? "text-[11px]" : "text-sm"} font-bold`}>Time Clock</span>
                    </Link>
                    
                    <button
                      onClick={() => setShowAddTaskDialog(true)}
                      className={`ccs-glass-control flex items-center rounded-xl text-blue-700 dark:text-blue-200 ${compactView ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`}
                    >
                      <ClipboardList className={compactView ? "h-3.5 w-3.5" : "h-4 w-4"} />
                      <span className={`${compactView ? "text-[11px]" : "text-sm"} font-bold`}>+ Task</span>
                    </button>
                  </div>

                  <GlobalSearch className={compactView ? "w-[116px] justify-center" : "w-full justify-center"} compact={compactView} shellGlass />
                </div>
              </div>

              {/* Mobile Navigation Menu */}
              {mobileMenuOpen && (
                <div className="lg:hidden mt-2 pb-4 border-t border-gray-200 pt-4 max-h-[calc(100vh-120px)] overflow-y-auto">
                  <div className="grid grid-cols-1 gap-2 px-2">
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
                          className={`px-4 py-3 rounded-xl transition-all duration-300 flex items-center gap-3 min-h-[48px] ${
                            isActive ? 'clay-card' : isInSplit ? 'bg-purple-50' : 'hover:bg-gray-100'
                          }`}
                          style={isActive ? { 
                            background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.9) 100%)` 
                          } : {}}
                          title="Ctrl+Click to open in split view"
                        >
                          <item.icon className="w-5 h-5 flex-shrink-0" style={{ color: isActive ? '#6B46C1' : isInSplit ? '#7C3AED' : '#9CA3AF' }} />
                          <span className={`font-medium text-base ${isActive ? 'text-purple-900' : isInSplit ? 'text-purple-700' : 'text-gray-600'}`}>
                            {item.title}
                          </span>
                          {isInSplit && <Columns className="w-4 h-4 text-purple-500" />}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.nav>
        )}

        {/* Mobile back button in header area */}
        {isMobile && !isRootRoute && (
          <div className="fixed top-0 left-0 right-0 z-50 flex items-center px-3 bg-white/95 backdrop-blur-sm border-b border-gray-200"
            style={{ height: '48px', paddingTop: 'env(safe-area-inset-top)', background: darkMode ? 'rgba(20,20,40,0.97)' : undefined, borderColor: darkMode ? 'rgba(255,255,255,0.1)' : undefined }}
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
        <motion.main
          ref={mainRef}
          initial={false}
          animate={{
            paddingTop: isMobile
              ? (isRootRoute ? 0 : 48)
              : (isSideNav ? 0 : (effectiveCollapsed ? collapsedRail + 4 : topNavHeight)),
            marginLeft: isSideNav
              ? (effectiveCollapsed ? collapsedRail : sideNavWidth)
              : 0,
          }}
          transition={isMobile ? { duration: 0.01 } : shellTransition}
          className={`flex-1 main-scroll-container ${isMobile ? 'main-content-mobile' : ''}`}
          style={{
            height: '100vh',
            overflow: 'auto',
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
                    <LoginGate>{children}</LoginGate>
                  </motion.div>
                </AnimatePresence>
              ) : <LoginGate>{children}</LoginGate>}
            </MultiPageContainer>
          </MultiPageContext.Provider>
        </motion.main>

        {/* Smartsheet Sync Status Widget — persistent on every page */}
        <SmartsheetSyncWidget compactOrderForm={location.pathname.replace(/\/+$/, '').toLowerCase() === '/orderform'} />

        {/* Add Task Dialog */}
        <AddTaskDialog 
          isOpen={showAddTaskDialog} 
          onClose={() => setShowAddTaskDialog(false)} 
        />

        {/* Announcement Manager - admin only */}
        {isUserAdmin(currentUser) && (
          <AnnouncementManager
            isOpen={showAnnouncementManager}
            onClose={() => setShowAnnouncementManager(false)}
            sessionToken={sessionToken}
          />
        )}

        {/* Announcement Banner */}
        <AnnouncementBanner />

        {/* Floating Buttons - hidden in fullscreen and on mobile */}
        {!isFullscreen && !isMobile && (
          <div
            className="fixed bottom-3 left-3 z-50 flex gap-1 opacity-20 hover:opacity-100 transition-opacity duration-200"
            style={{ marginLeft: isSideNav ? (effectiveCollapsed ? `${collapsedRail}px` : `${sideNavWidth}px`) : '0' }}
          >
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
          <>
            <nav
              className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 flex border-t border-gray-200"
              style={{
                background: darkMode ? 'rgba(20,20,40,0.97)' : 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
                height: 'calc(64px + env(safe-area-inset-bottom))',
              }}
            >
              {[
                    { label: 'My Workflow', icon: User, url: createPageUrl('MyWorkflow') },
                    { label: 'Sales', icon: DollarSign, url: createPageUrl('SalesPipeline') },
                    { label: 'Timeclock', icon: Clock, url: createPageUrl('TimeClock') },
                    currentUser
                      ? { label: 'Settings', icon: Settings, url: createPageUrl('UserSettings') }
                      : { label: 'Sign In', icon: LogIn, action: showLoginDialog },
                  ].map((item) => {
                    if (item.action) {
                      return (
                        <button
                          key={item.label}
                          data-login-gate-allow
                          onClick={item.action}
                          className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
                          style={{ minHeight: '44px', userSelect: 'none', color: '#7C3AED' }}
                        >
                          <item.icon className="w-5 h-5" />
                          <span className="text-xs font-medium">{item.label}</span>
                        </button>
                      );
                    }
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
                          setMobileMenuOpen(false);
                        }}
                        className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
                        style={{ minHeight: '44px', userSelect: 'none', color: isActive ? '#7C3AED' : '#6B7280' }}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </Link>
                    );
                  })}
              {/* More button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
                style={{ minHeight: '44px', userSelect: 'none', color: mobileMenuOpen ? '#7C3AED' : '#6B7280' }}
              >
                <Menu className="w-5 h-5" />
                <span className="text-xs font-medium">More</span>
              </button>
            </nav>

            {/* Mobile full-page menu overlay */}
            {mobileMenuOpen && (
              <div
                className="fixed inset-0 z-40"
                style={{ background: darkMode ? 'rgba(20,20,40,0.97)' : 'rgba(255,255,255,0.97)', paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}
              >
                <div className="h-full overflow-y-auto p-4 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold" style={{ color: darkMode ? '#e2e8f0' : '#1f2937' }}>All Pages</h2>
                    <button onClick={() => setMobileMenuOpen(false)} className="p-2">
                      <X className="w-5 h-5" style={{ color: darkMode ? '#e2e8f0' : '#6B7280' }} />
                    </button>
                  </div>
                  {currentUser && (
                    <div className="mb-3">
                      <FocusPausePair currentUser={currentUser} fullWidth compact />
                    </div>
                  )}
                  {isUserAdmin(currentUser) && (
                    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Link
                        to={createPageUrl("AdminSettings")}
                        onClick={() => setMobileMenuOpen(false)}
                        className="px-4 py-3 rounded-xl flex items-center gap-3 min-h-[48px] border border-indigo-200 bg-indigo-50"
                      >
                        <Settings className="w-5 h-5 flex-shrink-0 text-indigo-700" />
                        <span className="font-semibold text-base text-indigo-900">Admin Settings</span>
                      </Link>
                      <Link
                        to={`${createPageUrl("AdminSettings")}?tab=smartsheet`}
                        onClick={() => setMobileMenuOpen(false)}
                        className="px-4 py-3 rounded-xl flex items-center gap-3 min-h-[48px] border border-cyan-200 bg-cyan-50"
                      >
                        <GitBranch className="w-5 h-5 flex-shrink-0 text-cyan-700" />
                        <span className="font-semibold text-base text-cyan-900">Smartsheet Sync</span>
                      </Link>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    {[...navigationItems, ...meetingsDropdownItems].map((item) => {
                      const isActive = location.pathname === item.url;
                      return (
                        <Link
                          key={item.title}
                          to={item.url}
                          onClick={() => setMobileMenuOpen(false)}
                          className="px-4 py-3 rounded-xl flex items-center gap-3 min-h-[48px] border"
                          style={{
                            background: isActive
                              ? `linear-gradient(135deg, ${item.borderColor} 0%, ${item.color} 100%)`
                              : `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.95) 100%)`,
                            borderColor: isActive ? item.borderColor : item.borderColor,
                            borderWidth: isActive ? '2px' : '1px',
                          }}
                        >
                          <item.icon className="w-5 h-5 flex-shrink-0" style={{ color: isActive ? '#3730A3' : '#6B7280' }} />
                          <span className={`font-medium text-base ${isActive ? 'text-indigo-900 font-bold' : 'text-gray-700'}`}>
                            {item.title}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function LayoutContentWrapper({ children, currentPageName }) {
  const { currentUser } = useAuth();
  const internalFleetPage = String(currentPageName || "").startsWith("Fleet");
  const protectedChildren = internalFleetPage && !currentUser ? (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100">Fleet sign-in required</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">Sign in to CCS to view Fleet equipment, tracking, maintenance, inventory, costs, or other internal Fleet information.</p>
      </div>
    </div>
  ) : children;
  return (
    <ImportProgressProvider currentUserEmail={currentUser?.email}>
      <ResearchProgressProvider>
        <MultiImportProvider>
          <AnnouncementProvider currentPageName={currentPageName}>
            <LayoutContent>{protectedChildren}</LayoutContent>
            <ResearchProgressBar />
          </AnnouncementProvider>
        </MultiImportProvider>
      </ResearchProgressProvider>
    </ImportProgressProvider>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <AuthProvider>
      <LayoutContentWrapper currentPageName={currentPageName}>{children}</LayoutContentWrapper>
    </AuthProvider>
  );
}