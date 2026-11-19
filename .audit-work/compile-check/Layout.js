import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo, useCallback, createContext, useContext, useRef } from "react";
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
  Receipt,
  FileDiff,
  FileText,
  Scale,
  Package,
  BookOpen,
  Minimize2,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ChevronsDown,
  HardDrive,
  FolderPlus,
  PencilLine,
  Trash2
} from "lucide-react";
import { DarkModeSwitch } from "react-toggle-dark-mode";
import { AuthProvider, useAuth } from "@/components/auth/EmailGate";
import LoginGate from "@/components/auth/LoginGate";
import GlobalSearch from "@/components/workflow/GlobalSearch";
import AttentionBell from "@/components/workflow/AttentionBell";
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
import { TimeClockStatusProvider } from "@/components/timeclock/TimeClockStatusContext";
import FocusPausePair from "@/components/timeclock/FocusPausePair";
import TimeTracker from "@/components/timeclock/TimeTracker";
import SmartsheetSyncWidget from "@/components/admin/SmartsheetSyncWidget";
import SyncConflictAlert from "@/components/admin/SyncConflictAlert";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import NavPageLink from "@/components/layout/NavPageLink";
import NavFlyoutMenu from "@/components/layout/NavFlyoutMenu";
import SidebarNavGroup from "@/components/layout/SidebarNavGroup";
import NavContextMenu from "@/components/layout/NavContextMenu";
import NavItemEditor, { folderIconFor } from "@/components/layout/NavItemEditor";
import {
  createFolder as navCreateFolder,
  deleteFolder as navDeleteFolder,
  entriesToOrder,
  folderToken,
  isFolderToken,
  movePageToFolder,
  movePageToTop,
  newFolderId,
  patchFolder as navPatchFolder,
  removeUrlEverywhere,
  resolveTopLevel,
  sanitizeFolders,
  sanitizePageStyles,
  tokenFolderId
} from "@/components/layout/navCustomization";
import {
  applyNavOrder,
  hexToRgbTuple,
  loadCollapsedGroups,
  loadNavOrder,
  saveCollapsedGroups,
  saveNavOrder
} from "@/components/layout/navPreferences";
import { useWorkspacePreferences, WorkspacePreferencesProvider } from "@/components/layout/WorkspacePreferencesProvider";
const MultiPageContext = createContext(null);
export const useMultiPage = () => useContext(MultiPageContext);
const navigationItems = [
  { title: "My Workflow", url: createPageUrl("MyWorkflow"), icon: User, accent: "#A78BFA" },
  { title: "Main Workflow", url: createPageUrl("MainWorkflow"), icon: BarChart3, accent: "#38BDF8" },
  { title: "Sales Pipeline", url: createPageUrl("SalesPipeline"), icon: DollarSign, accent: "#2DD4BF" },
  { title: "Opportunities", url: createPageUrl("Opportunities"), icon: GitBranch, accent: "#A855F7" },
  { title: "Estimating", url: createPageUrl("Estimating"), icon: Calculator, accent: "#FBBF24" },
  { title: "Permitting", url: createPageUrl("Permitting"), icon: ClipboardCheck, accent: "#FB7185" },
  { title: "Design", url: createPageUrl("Design"), icon: Pencil, accent: "#60A5FA" },
  { title: "Production", url: createPageUrl("Production"), icon: Hammer, accent: "#4ADE80" },
  { title: "Fabrication", url: createPageUrl("Fabrication"), icon: Wrench, accent: "#C084FC" },
  { title: "Installation/Delivery", url: createPageUrl("InstallationDeliver"), icon: Truck, accent: "#FB923C" },
  { title: "SOP", url: createPageUrl("SOP"), icon: BookOpen, accent: "#F472B6" },
  { title: "Server Files", url: createPageUrl("ServerFiles"), icon: HardDrive, accent: "#94A3B8" },
  { title: "Order Form", url: createPageUrl("OrderForm"), icon: ClipboardList, accent: "#34D399" },
  { title: "Estimator", url: createPageUrl("Estimator"), icon: Calculator, accent: "#F87171" },
  { title: "Fleet", url: createPageUrl("FleetOverview"), icon: NavigationIcon, accent: "#22D3EE" }
];
const meetingsNavItems = [
  { title: "SIPs", url: createPageUrl("SIPs"), icon: ClipboardList, accent: "#FACC15" },
  { title: "Monday Meeting", url: createPageUrl("MondayMorningMeeting"), icon: ClipboardList, accent: "#A3E635" }
];
const reportsNavItems = [
  { title: "Financials", url: createPageUrl("Financials"), icon: DollarSign, accent: "#3B82F6" },
  { title: "Invoices", url: createPageUrl("Invoices"), icon: Receipt, accent: "#10B981" },
  { title: "Change Orders", url: createPageUrl("ChangeOrders"), icon: FileDiff, accent: "#F97316" },
  { title: "Purchase Orders", url: createPageUrl("PurchaseOrders"), icon: Package, accent: "#0EA5E9" },
  { title: "Job Costing", url: createPageUrl("JobCosting"), icon: BarChart3, accent: "#8B5CF6" },
  { title: "Inventory", url: createPageUrl("Inventory"), icon: Package, accent: "#84CC16" },
  { title: "Ops Reports", url: createPageUrl("OpsReports"), icon: BarChart3, accent: "#22D3EE" },
  { title: "Statements", url: createPageUrl("CustomerStatements"), icon: FileText, accent: "#F59E0B" },
  { title: "Reconciliation", url: createPageUrl("Reconciliation"), icon: Scale, accent: "#34D399" }
];
const ALL_NAV_PAGES = new Map(
  [...navigationItems, ...meetingsNavItems, ...reportsNavItems].map((item) => [item.url, item])
);
const BUILTIN_NAV_FOLDERS = [
  { id: "meetings", name: "Meetings", icon: "Calendar", color: "#FACC15", style: "glass", items: meetingsNavItems.map((i) => i.url) },
  { id: "reports", name: "Reports", icon: "BarChart3", color: "#8B5CF6", style: "glass", items: reportsNavItems.map((i) => i.url) }
];
const pageUrlFromDraggable = (draggableId) => {
  const slash = String(draggableId || "").indexOf("/");
  return slash >= 0 ? draggableId.slice(slash) : null;
};
const isUserAdmin = (user) => {
  return user?.role === "admin";
};
const SHELL_SPRING = {
  type: "spring",
  stiffness: 210,
  damping: 30,
  mass: 0.82
};
function ShellViewControls({
  compactView,
  onToggleCompact,
  collapsed,
  onToggleCollapsed,
  navLayout
} = {}) {
  const CollapseIcon = navLayout === "side" ? collapsed ? ChevronsRight : ChevronsLeft : collapsed ? ChevronsDown : ChevronsUp;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      "data-shell-view-controls": true,
      className: `ccs-glass-strip mt-1 flex items-center gap-0.5 rounded-xl ${compactView ? "h-[17px] p-px" : "h-[20px] p-px"}`,
      children: [
        /* @__PURE__ */ jsxs(
          motion.button,
          {
            type: "button",
            "data-shell-compact-toggle": true,
            onClick: onToggleCompact,
            "aria-pressed": compactView,
            title: compactView ? "Return navigation to comfortable spacing" : "Use compact navigation spacing",
            className: `flex h-full min-w-0 flex-1 items-center justify-center rounded-lg font-bold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${compactView ? "gap-0.5 px-1 text-[10px] whitespace-nowrap" : "gap-1 px-1.5 text-[10px] whitespace-nowrap"} ${compactView ? "bg-violet-400/20 text-violet-100 shadow-inner" : "text-slate-200 hover:bg-white/10"}`,
            whileHover: { y: -1, scale: 1.025 },
            whileTap: { scale: 0.96 },
            transition: { duration: 0.12 },
            children: [
              /* @__PURE__ */ jsx(Minimize2, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsx("span", { children: compactView ? "Roomy" : "Compact" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          motion.button,
          {
            type: "button",
            "data-shell-collapse-toggle": true,
            onClick: onToggleCollapsed,
            "aria-pressed": collapsed,
            title: collapsed ? "Pin navigation open" : "Collapse navigation; hover the screen edge to peek",
            className: `flex h-full min-w-0 flex-1 items-center justify-center rounded-lg font-bold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${compactView ? "gap-0.5 px-1 text-[10px] whitespace-nowrap" : "gap-1 px-1.5 text-[10px] whitespace-nowrap"} ${collapsed ? "bg-cyan-400/15 text-cyan-100 shadow-inner" : "text-slate-200 hover:bg-white/10"}`,
            whileHover: { y: -1, scale: 1.025 },
            whileTap: { scale: 0.96 },
            transition: { duration: 0.12 },
            children: [
              /* @__PURE__ */ jsx(CollapseIcon, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsx("span", { children: collapsed ? "Pin" : "Collapse" })
            ]
          }
        )
      ]
    }
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
  ` : ""}
`;
const ROOT_ROUTES = [
  createPageUrl("MainWorkflow"),
  createPageUrl("MyWorkflow"),
  createPageUrl("SalesPipeline"),
  createPageUrl("Opportunities"),
  createPageUrl("Invoices"),
  createPageUrl("ChangeOrders"),
  createPageUrl("PurchaseOrders"),
  createPageUrl("JobCosting"),
  createPageUrl("Inventory"),
  createPageUrl("OrderForm"),
  createPageUrl("TimeClock"),
  createPageUrl("AdminSettings"),
  createPageUrl("UserSettings"),
  "/"
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
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showAnnouncementManager, setShowAnnouncementManager] = useState(false);
  const { currentUser, sessionToken, isRegistered, logout, getUserFirstName, showLoginDialog } = useAuth();
  const { prefs: workspacePrefs, reportNavOrder, updatePrefs: updateWorkspacePrefs, loaded: workspacePrefsLoaded } = useWorkspacePreferences();
  const navPrefs = workspacePrefs.navigation || {};
  const navHidden = navPrefs.hidden || [];
  const { additionalPages, addPage, removePage, clearPages, isInMultiView, orientation, toggleOrientation } = useMultiPageView();
  const [navOrder, setNavOrder] = useState(() => loadNavOrder(currentUser?.email));
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    const seeded = workspacePrefs.navigation?.collapsedGroups;
    return seeded && Object.keys(seeded).length ? seeded : loadCollapsedGroups();
  });
  const collapsedHydratedRef = useRef(false);
  useEffect(() => {
    if (collapsedHydratedRef.current || !workspacePrefsLoaded) return;
    collapsedHydratedRef.current = true;
    const serverGroups = workspacePrefs.navigation?.collapsedGroups;
    if (serverGroups && Object.keys(serverGroups).length) setCollapsedGroups(serverGroups);
  }, [workspacePrefsLoaded, workspacePrefs.navigation?.collapsedGroups]);
  useEffect(() => {
    setNavOrder(loadNavOrder(currentUser?.email));
  }, [currentUser?.email]);
  useEffect(() => {
    const segment = (location.pathname || "/").split("/").filter(Boolean).pop() || "MyWorkflow";
    const name = segment.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").trim();
    document.title = name + " - Workflow Manager";
  }, [location.pathname]);
  const orderedNavItems = useMemo(() => applyNavOrder(navigationItems, navOrder), [navOrder]);
  const visibleNavItems = useMemo(() => orderedNavItems.filter((i) => !navHidden.includes(i.url)), [orderedNavItems, navHidden]);
  const effectiveFolders = useMemo(
    () => sanitizeFolders(navPrefs.folders) ?? BUILTIN_NAV_FOLDERS,
    [navPrefs.folders]
  );
  const pageStyles = useMemo(() => sanitizePageStyles(navPrefs.pageStyles), [navPrefs.pageStyles]);
  const folderMemberUrls = useMemo(
    () => new Set(effectiveFolders.flatMap((f) => f.items)),
    [effectiveFolders]
  );
  const barPageUrls = useMemo(
    () => new Set(navigationItems.map((i) => i.url).filter((u) => !folderMemberUrls.has(u) && !navHidden.includes(u))),
    [folderMemberUrls, navHidden]
  );
  const topEntries = useMemo(
    () => resolveTopLevel(navOrder, effectiveFolders, barPageUrls),
    [navOrder, effectiveFolders, barPageUrls]
  );
  const styledPage = useCallback((url) => {
    const base = ALL_NAV_PAGES.get(url);
    if (!base) return null;
    const s = pageStyles[url];
    if (!s) return base;
    return { ...base, title: s.name || base.title, accent: s.color || base.accent, stylePreset: s.style || "glass" };
  }, [pageStyles]);
  const folderItems = useCallback(
    (folder) => folder.items.filter((u) => !navHidden.includes(u)).map(styledPage).filter(Boolean),
    [navHidden, styledPage]
  );
  const barItems = useMemo(
    () => visibleNavItems.map((i) => styledPage(i.url) || i),
    [visibleNavItems, styledPage]
  );
  const barItemByUrl = useMemo(() => new Map(barItems.map((i) => [i.url, i])), [barItems]);
  const [navMenu, setNavMenu] = useState(null);
  const [navEditor, setNavEditor] = useState(null);
  const navDragFlag = (v) => {
    if (v === void 0) return window.__ccsNavDragging;
    window.__ccsNavDragging = v;
  };
  const persistNavState = useCallback((order, folders) => {
    setNavOrder(order);
    saveNavOrder(currentUser?.email, order);
    reportNavOrder(order);
    updateWorkspacePrefs("navigation.folders", folders);
  }, [currentUser?.email, reportNavOrder, updateWorkspacePrefs]);
  const navState = useCallback(
    () => ({ order: navOrder, folders: effectiveFolders }),
    [navOrder, effectiveFolders]
  );
  const handleBarContextMenu = useCallback((event) => {
    if (event.target.closest("[data-nav-item],[data-nav-folder]")) return;
    event.preventDefault();
    setNavMenu({ x: event.clientX, y: event.clientY, kind: "bar" });
  }, []);
  const openFolderEditor = useCallback((folderId, isNew = false) => {
    setNavEditor({ mode: "folder", folderId, isNew });
  }, []);
  const openPageEditor = useCallback((url) => setNavEditor({ mode: "page", url }), []);
  useEffect(() => {
    const sync = () => setNavOrder(loadNavOrder(currentUser?.email));
    window.addEventListener("ccs-nav-order-sync", sync);
    return () => window.removeEventListener("ccs-nav-order-sync", sync);
  }, [currentUser?.email]);
  useEffect(() => {
    if (location.pathname === "/" && navPrefs.landingPage) {
      navigate(navPrefs.landingPage, { replace: true });
    }
  }, [location.pathname, navPrefs.landingPage, navigate]);
  const isInSplitView = useCallback(
    (item) => Boolean(additionalPages.find((p) => item.url.includes(p.name))),
    [additionalPages]
  );
  const handleNavReorder = (result) => {
    const { source, destination, draggableId, combine } = result;
    navDragFlag(false);
    const state = navState();
    if (combine) {
      const target = String(combine.draggableId || "");
      const folderId = isFolderToken(target) ? tokenFolderId(target) : target.startsWith("sfolder:") ? target.slice("sfolder:".length) : null;
      const url2 = pageUrlFromDraggable(draggableId);
      if (!url2) return;
      if (folderId) {
        const next = movePageToFolder(state, url2, folderId);
        persistNavState(mergeHiddenTail(next.order), next.folders);
        return;
      }
      const targetUrl = pageUrlFromDraggable(target);
      if (!targetUrl || targetUrl === url2) return;
      const { order, folders } = removeUrlEverywhere(state.order, state.folders, url2);
      const entries = resolveTopLevel(order, folders, barPageUrls);
      const at = entries.findIndex((e) => e.type === "page" && e.url === targetUrl);
      entries.splice(at < 0 ? entries.length : at, 0, { type: "page", url: url2 });
      persistNavState(mergeHiddenTail(entriesToOrder(entries)), folders);
      return;
    }
    if (!destination) return;
    const destId = destination.droppableId;
    const srcId = source.droppableId;
    if (isFolderToken(draggableId) || draggableId.startsWith("sfolder:")) {
      if (destId !== "page-nav-top" && destId !== "page-nav-side") return;
      const token = isFolderToken(draggableId) ? draggableId : draggableId.replace(/^sfolder:/, "folder:");
      const entries = topEntries.slice();
      const from = entries.findIndex((e) => e.type === "folder" && folderToken(e.id) === token);
      if (from < 0) return;
      const [moved] = entries.splice(from, 1);
      entries.splice(destination.index, 0, moved);
      const order = entriesToOrder(entries);
      persistNavState(mergeHiddenTail(order), effectiveFolders);
      return;
    }
    const url = pageUrlFromDraggable(draggableId);
    if (!url) return;
    const listDest = destId.startsWith("folder-list:") ? destId.slice(destId.indexOf(":") + 1) : null;
    if (listDest) {
      const folder = effectiveFolders.find((f) => f.id === listDest);
      if (!folder) return;
      if (srcId === destId && source.index === destination.index) return;
      const next = movePageToFolder(state, url, listDest, destination.index);
      persistNavState(mergeHiddenTail(next.order), next.folders);
      return;
    }
    if (destId === "page-nav-top" || destId === "page-nav-side") {
      if (srcId === destId) {
        if (source.index === destination.index) return;
        const entries = topEntries.slice();
        const [moved] = entries.splice(source.index, 1);
        if (!moved) return;
        entries.splice(destination.index, 0, moved);
        persistNavState(mergeHiddenTail(entriesToOrder(entries)), effectiveFolders);
      } else {
        const next = movePageToTop(state, url, null);
        const entries = topEntries.filter((e) => !(e.type === "page" && e.url === url));
        entries.splice(destination.index, 0, { type: "page", url });
        persistNavState(mergeHiddenTail(entriesToOrder(entries)), next.folders);
      }
    }
  };
  const handleNavDragStart = () => navDragFlag(true);
  const hiddenTail = () => orderedNavItems.filter((i) => navHidden.includes(i.url)).map((i) => i.url);
  const mergeHiddenTail = (order) => [...order, ...hiddenTail().filter((u) => !order.includes(u))];
  const handleDeleteFolder = useCallback((folderId) => {
    const next = navDeleteFolder(navState(), folderId);
    persistNavState(mergeHiddenTail(next.order), next.folders);
    setNavEditor(null);
  }, [navState, persistNavState]);
  const handleSaveFolder = useCallback((folderId, isNew, patch) => {
    if (isNew) {
      const folder = { id: newFolderId(), name: patch.name, color: patch.color, style: patch.style, icon: patch.icon, items: [] };
      const next = navCreateFolder(navState(), folder);
      persistNavState(mergeHiddenTail(next.order), next.folders);
    } else {
      const next = navPatchFolder(navState(), folderId, { name: patch.name, color: patch.color, style: patch.style, icon: patch.icon });
      persistNavState(mergeHiddenTail(next.order), next.folders);
    }
    setNavEditor(null);
  }, [navState, persistNavState]);
  const handleSavePage = useCallback((url, patch) => {
    const base = ALL_NAV_PAGES.get(url);
    const next = { ...pageStyles };
    const value = {};
    if (patch.name && patch.name !== base?.title) value.name = patch.name;
    if (patch.color && patch.color !== base?.accent) value.color = patch.color;
    if (patch.style && patch.style !== "glass") value.style = patch.style;
    if (Object.keys(value).length) next[url] = value;
    else delete next[url];
    updateWorkspacePrefs("navigation.pageStyles", next);
    setNavEditor(null);
  }, [pageStyles, updateWorkspacePrefs]);
  const handleResetPage = useCallback((url) => {
    const next = { ...pageStyles };
    delete next[url];
    updateWorkspacePrefs("navigation.pageStyles", next);
    setNavEditor(null);
  }, [pageStyles, updateWorkspacePrefs]);
  const toggleNavGroup = (key) => {
    const next = { ...collapsedGroups, [key]: !collapsedGroups[key] };
    setCollapsedGroups(next);
    saveCollapsedGroups(next);
    updateWorkspacePrefs("navigation.collapsedGroups", next);
  };
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isNarrowShell, setIsNarrowShell] = useState(() => window.innerWidth < 1400);
  const [isShortShell, setIsShortShell] = useState(() => window.innerHeight < 720);
  useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth < 768);
      setIsNarrowShell(window.innerWidth < 1400);
      setIsShortShell(window.innerHeight < 720);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
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
  const handleNavClick = (e, item) => {
    if (!isMobile && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const pageName = item.url.split("/").pop();
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
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
  const topBarCompact = compactView || isNarrowShell;
  const collapsedRail = 10;
  const shellTransition = reduceMotion ? { duration: 0.01 } : SHELL_SPRING;
  useEffect(() => {
    if (isMobile || isSideNav) return void 0;
    const node = topNavRef.current;
    if (!node) return void 0;
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
    if (!effectiveCollapsed) return void 0;
    const trackCollapsedShellPointer = (event) => {
      const target = event.target;
      const insideShell = target instanceof Element && Boolean(
        target.closest(".top-nav, .side-nav, [data-shell-navigation-handle]")
      );
      const onEdge = navLayout === "side" ? event.clientX <= collapsedRail + 8 : event.clientY <= collapsedRail + 8;
      const nextHovered = insideShell || onEdge;
      setIsHovered((previous) => previous === nextHovered ? previous : nextHovered);
    };
    window.addEventListener("pointermove", trackCollapsedShellPointer, { passive: true });
    return () => window.removeEventListener("pointermove", trackCollapsedShellPointer);
  }, [effectiveCollapsed, navLayout]);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("style", { children: `
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

        /* Crystal navigation. Light mode is bright smoked glass; dark mode intentionally stays deep navy. */
        .ccs-glass-shell {
          --glass-accent-rgb: 148 163 184;
          isolation: isolate;
          color: #0f172a;
          background:
            radial-gradient(circle at 14% -12%, rgba(255,255,255,0.90), transparent 30%),
            radial-gradient(circle at 86% 118%, rgba(125,211,252,0.20), transparent 36%),
            linear-gradient(142deg, rgba(241,245,249,0.78) 0%, rgba(226,232,240,0.62) 44%, rgba(203,213,225,0.58) 100%);
          border: 1px solid rgba(255,255,255,0.78);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.98),
            inset 1px 0 0 rgba(255,255,255,0.50),
            inset 0 -1px 0 rgba(100,116,139,0.20),
            0 20px 52px rgba(51,65,85,0.16),
            0 5px 18px rgba(71,85,105,0.10);
          backdrop-filter: blur(34px) saturate(185%) contrast(108%);
          -webkit-backdrop-filter: blur(34px) saturate(185%) contrast(108%);
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
          color: #1e293b;
          background:
            radial-gradient(circle at 18% 0%, rgba(255,255,255,0.92), transparent 32%),
            linear-gradient(145deg, rgba(255,255,255,0.56), rgba(203,213,225,0.34));
          border: 1px solid rgba(255,255,255,0.78);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.98),
            inset 0 -1px 0 rgba(100,116,139,0.16),
            0 7px 18px rgba(51,65,85,0.10);
          backdrop-filter: blur(22px) saturate(165%);
          -webkit-backdrop-filter: blur(22px) saturate(165%);
        }

        .ccs-glass-panel h2 { color: #0f172a !important; }
        .ccs-glass-panel p { color: #64748b !important; }
        .ccs-glass-strip button { color: #334155 !important; }

        .ccs-glass-control,
        .ccs-glass-nav-item {
          --glass-accent-rgb: 148 163 184;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          color: #334155;
          background:
            radial-gradient(circle at 16% -12%, rgba(255,255,255,0.92), transparent 34%),
            linear-gradient(145deg, rgb(var(--glass-accent-rgb) / 0.18) 0%, rgba(255,255,255,0.52) 52%, rgba(203,213,225,0.36) 100%) !important;
          border: 1px solid rgb(var(--glass-accent-rgb) / 0.44) !important;
          backdrop-filter: blur(20px) saturate(170%);
          -webkit-backdrop-filter: blur(20px) saturate(170%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.98),
            inset 1px 0 0 rgba(255,255,255,0.46),
            inset 0 -1px 0 rgba(100,116,139,0.16),
            0 7px 18px rgba(51,65,85,0.11) !important;
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

        .ccs-glass-control > span { color: inherit !important; }

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

        .ccs-glass-purple { --glass-accent-rgb: 167 139 250; color: #6d28d9 !important; }
        .ccs-glass-red { --glass-accent-rgb: 248 113 113; color: #b91c1c !important; }
        .ccs-glass-green { --glass-accent-rgb: 74 222 128; color: #047857 !important; }
        .ccs-glass-blue { --glass-accent-rgb: 96 165 250; color: #1d4ed8 !important; }
        .ccs-glass-cyan { --glass-accent-rgb: 34 211 238; color: #0e7490 !important; }
        .ccs-glass-neutral { --glass-accent-rgb: 148 163 184; color: #334155 !important; }

        .ccs-glass-nav-item > span { color: #334155 !important; }

        .ccs-nav-styled {
          position: relative;
          transition:
            transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 180ms ease,
            box-shadow 180ms ease;
        }

        .ccs-nav-styled:hover {
          transform: translateY(-1px);
          filter: brightness(1.07) saturate(1.06);
        }

        .ccs-nav-styled:active {
          transform: translateY(0) scale(0.985);
          filter: brightness(0.96);
        }

        .ccs-focus-pause-glass {
          --glass-accent-rgb: 167 139 250;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          background:
            radial-gradient(circle at 12% -10%, rgba(255,255,255,0.94), transparent 34%),
            linear-gradient(145deg, rgba(255,255,255,0.54), rgba(203,213,225,0.34)) !important;
          border-color: rgba(148,163,184,0.42) !important;
        }

        .ccs-focus-segment,
        .ccs-pause-segment {
          width: 100%;
          min-width: 0;
          position: relative;
          z-index: 2;
        }

        .ccs-focus-segment {
          color: #6d28d9 !important;
          background:
            linear-gradient(145deg, rgba(167,139,250,0.28), rgba(255,255,255,0.20)) !important;
          border-right: 1px solid rgba(148,163,184,0.34) !important;
        }

        .ccs-pause-segment {
          color: #0f766e !important;
          background:
            linear-gradient(145deg, rgba(45,212,191,0.24), rgba(255,255,255,0.18)) !important;
          border-left: 0 !important;
        }

        .ccs-focus-segment span,
        .ccs-focus-segment svg { color: #7c3aed !important; }
        .ccs-pause-segment span,
        .ccs-pause-segment svg { color: #0f766e !important; }
        .ccs-pause-segment[aria-pressed="true"],
        .ccs-pause-segment[aria-pressed="true"] span,
        .ccs-pause-segment[aria-pressed="true"] svg { color: #047857 !important; }

        .ccs-focus-pause-glass > button:only-child {
          grid-column: 1 / -1;
          border-right: 0 !important;
        }

        .ccs-navigation-handle {
          color: #334155;
          background:
            radial-gradient(circle at 20% -20%, rgba(255,255,255,0.96), transparent 38%),
            linear-gradient(145deg, rgba(248,250,252,0.82), rgba(203,213,225,0.62));
          border: 1px solid rgba(255,255,255,0.84);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.98),
            inset 0 -1px 0 rgba(100,116,139,0.20),
            0 12px 30px rgba(51,65,85,0.18);
          backdrop-filter: blur(26px) saturate(175%);
          -webkit-backdrop-filter: blur(26px) saturate(175%);
        }

        .dark .ccs-glass-shell {
          color: #f8fafc;
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
          color: #f8fafc;
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
          color: #f8fafc;
          background:
            radial-gradient(circle at 16% -12%, rgba(255,255,255,0.12), transparent 34%),
            linear-gradient(145deg, rgb(var(--glass-accent-rgb) / 0.30) 0%, rgba(15,23,42,0.46) 58%, rgba(2,6,23,0.56) 100%) !important;
          border-color: rgb(var(--glass-accent-rgb) / 0.58) !important;
        }

        .dark .ccs-glass-panel h2 { color: #f8fafc !important; }
        .dark .ccs-glass-panel p { color: #94a3b8 !important; }
        .dark .ccs-glass-strip button { color: #e2e8f0 !important; }
        .dark .ccs-glass-nav-item > span { color: #e2e8f0 !important; }

        .dark .ccs-glass-purple { color: #ddd6fe !important; }
        .dark .ccs-glass-red { color: #fecaca !important; }
        .dark .ccs-glass-green { color: #bbf7d0 !important; }
        .dark .ccs-glass-blue { color: #bfdbfe !important; }
        .dark .ccs-glass-cyan { color: #a5f3fc !important; }
        .dark .ccs-glass-neutral { color: #e2e8f0 !important; }

        .dark .ccs-focus-pause-glass {
          background:
            radial-gradient(circle at 12% -10%, rgba(255,255,255,0.12), transparent 32%),
            linear-gradient(145deg, rgba(15,23,42,0.62), rgba(2,6,23,0.68)) !important;
          border-color: rgba(196,181,253,0.42) !important;
        }

        .dark .ccs-focus-segment {
          color: #ddd6fe !important;
          background: linear-gradient(145deg, rgba(139,92,246,0.34), rgba(76,29,149,0.22)) !important;
          border-right-color: rgba(255,255,255,0.15) !important;
        }

        .dark .ccs-pause-segment {
          color: #99f6e4 !important;
          background: linear-gradient(145deg, rgba(20,184,166,0.24), rgba(15,118,110,0.32)) !important;
        }

        .dark .ccs-focus-segment span,
        .dark .ccs-focus-segment svg { color: #c4b5fd !important; }
        .dark .ccs-pause-segment span,
        .dark .ccs-pause-segment svg { color: #5eead4 !important; }
        .dark .ccs-pause-segment[aria-pressed="true"],
        .dark .ccs-pause-segment[aria-pressed="true"] span,
        .dark .ccs-pause-segment[aria-pressed="true"] svg { color: #6ee7b7 !important; }

        .dark .ccs-navigation-handle {
          color: #f8fafc;
          background:
            radial-gradient(circle at 20% -20%, rgba(255,255,255,0.22), transparent 36%),
            linear-gradient(145deg, rgba(71,85,105,0.86), rgba(30,41,59,0.78));
          border-color: rgba(255,255,255,0.34);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.52),
            inset 0 -1px 0 rgba(15,23,42,0.34),
            0 12px 30px rgba(15,23,42,0.32);
        }

        .top-nav {
          padding-top: env(safe-area-inset-top);
          will-change: transform, opacity;
        }

        .ccs-topbar-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-areas: "brand menu" "utilities utilities";
          align-items: center;
          gap: 6px 10px;
        }
        .ccs-topbar-brand { grid-area: brand; justify-self: start; min-width: 150px; }
        .ccs-topbar-brand [data-shell-view-controls] { min-height: 24px; }
        .ccs-topbar-brand [data-shell-view-controls] button { font-size: 11px; }
        .ccs-topbar-layout[data-compact="true"] .ccs-topbar-brand {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }
        .ccs-topbar-layout[data-compact="true"] .ccs-topbar-brand [data-shell-view-controls] {
          margin-top: 0;
          min-width: 132px;
          flex-shrink: 0;
        }
        .ccs-topbar-menu { grid-area: menu; }
        .ccs-topbar-utilities { grid-area: utilities; justify-self: end; min-width: 0; max-width: 100%; }
        .ccs-topbar-utilities .ccs-glass-control > span { font-size: 12px; }
        .ccs-topbar-links { grid-area: links; min-width: 0; }
        .ccs-topbar-links .ccs-glass-nav-item span { font-size: 12px; }

        @media (max-width: 1399px) {
          .ccs-topbar-links[data-manual-compact="false"] .ccs-glass-nav-item {
            gap: 4px;
            padding: 4px 6px;
          }
        }
        @media (max-height: 600px) {
          .ccs-topbar-menu-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @media (max-height: 720px) {
          .side-nav > div:first-child { padding: 6px; }
          .side-nav .ccs-glass-panel { padding: 4px 6px; gap: 4px; }
          .side-nav .ccs-glass-panel p { display: none; }
          .side-nav .mb-4 { margin-bottom: 8px; }
          .side-nav .mb-2 { margin-bottom: 6px; }
          .side-nav .space-y-2 > :not([hidden]) ~ :not([hidden]) { margin-top: 4px; }
          .side-nav .space-y-1 > :not([hidden]) ~ :not([hidden]) { margin-top: 2px; }
          .side-nav .ccs-glass-nav-item { padding-top: 3px; padding-bottom: 3px; gap: 6px; }
          .side-nav .ccs-glass-nav-item span { font-size: 11px; }
        }
        @media (min-width: 1024px) {
          .ccs-topbar-layout {
            grid-template-columns: auto minmax(0, 1fr);
            grid-template-areas: "brand utilities" "links links";
          }
        }
        @media (min-width: 1600px) {
          .ccs-topbar-layout {
            grid-template-columns: auto minmax(0, 1fr) auto;
            grid-template-areas: "brand links utilities";
          }
        }

        .side-nav {
          will-change: transform, opacity, width;
        }

        .ccs-scrollbar-hidden { scrollbar-width: none; -ms-overflow-style: none; }
        .ccs-scrollbar-hidden::-webkit-scrollbar { display: none; }

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

        /* \u2500\u2500 Mobile global enhancements \u2500\u2500 */
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
      ` }),
    /* @__PURE__ */ jsxs("div", { className: `h-full flex ${isSideNav ? "flex-row" : "flex-col"}`, style: { background: darkMode ? "#1a1a2e" : "linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)" }, children: [
      /* @__PURE__ */ jsx(WorkPauseOverlay, {}),
      effectiveCollapsed && /* @__PURE__ */ jsx(
        "div",
        {
          "data-shell-hover-rail": true,
          className: navLayout === "side" ? "fixed bottom-0 left-0 top-0 z-40" : "fixed left-0 right-0 top-0 z-40",
          style: navLayout === "side" ? { width: `${collapsedRail + 8}px` } : { height: `${collapsedRail + 8}px` },
          onMouseEnter: () => setIsHovered(true)
        }
      ),
      /* @__PURE__ */ jsx(AnimatePresence, { children: effectiveCollapsed && (navLayout === "side" ? /* @__PURE__ */ jsxs(
        motion.button,
        {
          "data-shell-navigation-handle": "side",
          type: "button",
          initial: reduceMotion ? false : { x: -18, opacity: 0 },
          animate: { x: isHovered ? sideNavWidth - 1 : 0, opacity: 1 },
          exit: reduceMotion ? { opacity: 0 } : { x: -18, opacity: 0 },
          transition: shellTransition,
          onMouseEnter: () => setIsHovered(true),
          onFocus: () => setIsHovered(true),
          onClick: () => {
            setNavCollapsed(false);
            setIsHovered(false);
          },
          className: "ccs-navigation-handle fixed left-0 top-1/2 z-[60] flex h-[132px] w-[30px] items-center justify-center gap-2 rounded-r-2xl text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-100",
          style: { marginTop: -66 },
          title: "Open Navigation Bar",
          "aria-label": "Open Navigation Bar",
          children: [
            /* @__PURE__ */ jsx(ChevronsRight, { className: "h-3.5 w-3.5 flex-shrink-0" }),
            /* @__PURE__ */ jsx("span", { style: { writingMode: "vertical-rl", transform: "rotate(180deg)" }, children: "Navigation Bar" })
          ]
        },
        "side-navigation-handle"
      ) : /* @__PURE__ */ jsxs(
        motion.button,
        {
          "data-shell-navigation-handle": "top",
          type: "button",
          initial: reduceMotion ? false : { y: -14, opacity: 0 },
          animate: { y: isHovered ? topNavHeight - 1 : 0, opacity: 1 },
          exit: reduceMotion ? { opacity: 0 } : { y: -14, opacity: 0 },
          transition: shellTransition,
          onMouseEnter: () => setIsHovered(true),
          onFocus: () => setIsHovered(true),
          onClick: () => {
            setNavCollapsed(false);
            setIsHovered(false);
          },
          className: "ccs-navigation-handle fixed left-1/2 top-0 z-[60] flex h-[28px] w-[148px] items-center justify-center gap-1.5 rounded-b-2xl text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-100",
          style: { marginLeft: -74 },
          title: "Open Navigation Bar",
          "aria-label": "Open Navigation Bar",
          children: [
            /* @__PURE__ */ jsx(ChevronsDown, { className: "h-3.5 w-3.5" }),
            /* @__PURE__ */ jsx("span", { children: "Navigation Bar" })
          ]
        },
        "top-navigation-handle"
      )) }),
      isSideNav && /* @__PURE__ */ jsxs(
        motion.nav,
        {
          initial: false,
          animate: {
            x: effectiveCollapsed && !isHovered ? -(sideNavWidth - collapsedRail) : 0,
            opacity: effectiveCollapsed && !isHovered ? 0.94 : 1
          },
          transition: shellTransition,
          className: "side-nav ccs-glass-shell fixed bottom-0 left-0 top-0 z-50 flex flex-col overflow-visible",
          style: { width: sideNavWidth },
          children: [
            /* @__PURE__ */ jsxs("div", { className: compactView ? "p-1.5" : "p-3", children: [
              /* @__PURE__ */ jsxs("div", { className: compactView ? "mb-1.5" : "mb-4", children: [
                /* @__PURE__ */ jsxs("div", { className: `ccs-glass-panel flex items-center ${compactView ? "gap-1.5 rounded-xl px-1.5 py-1" : "gap-2 rounded-2xl px-3 py-2"}`, children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => setNavLayout(navLayout === "top" ? "side" : "top"),
                      className: `ccs-glass-control ccs-glass-purple flex flex-shrink-0 items-center justify-center text-violet-200 ${compactView ? "h-6 w-6 rounded-lg" : "h-8 w-8 rounded-xl"}`,
                      title: "Switch to Top Bar",
                      children: /* @__PURE__ */ jsx(PanelTop, { className: compactView ? "h-3.5 w-3.5" : "h-4 w-4" })
                    }
                  ),
                  /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
                    /* @__PURE__ */ jsx("h2", { className: `${compactView ? "text-xs" : "text-sm"} truncate font-bold leading-tight text-white`, children: "Sign Shop" }),
                    !compactView && /* @__PURE__ */ jsx("p", { className: "truncate text-xs text-slate-300", children: "Workflow" })
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  ShellViewControls,
                  {
                    compactView,
                    onToggleCompact: () => setCompactView((value) => !value),
                    collapsed: navCollapsed,
                    onToggleCollapsed: () => {
                      setNavCollapsed((value) => !value);
                      setIsHovered(false);
                    },
                    navLayout: "side"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: `${compactView ? "mb-2 space-y-1" : "mb-4 space-y-2"}`, children: [
                !currentUser ? /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    "data-login-gate-allow": true,
                    onClick: showLoginDialog,
                    className: `ccs-glass-control ccs-glass-purple w-full flex items-center justify-center rounded-xl text-violet-200 ${compactView ? "h-7 gap-1 text-xs" : "h-9 gap-2 text-sm"}`,
                    title: "Sign In",
                    children: [
                      /* @__PURE__ */ jsx(LogIn, { className: "h-4 w-4 text-violet-300" }),
                      /* @__PURE__ */ jsx("span", { className: "font-bold text-sm text-violet-100", children: "Sign In" })
                    ]
                  }
                ) : /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    "data-login-gate-allow": true,
                    onClick: logout,
                    className: `ccs-glass-control ccs-glass-neutral w-full flex items-center justify-center rounded-xl text-slate-100 ${compactView ? "h-7 gap-1 text-xs" : "h-9 gap-2 text-sm"}`,
                    title: `Logout ${getUserFirstName()}`,
                    children: [
                      /* @__PURE__ */ jsx(LogOut, { className: compactView ? "h-3.5 w-3.5" : "h-4 w-4" }),
                      /* @__PURE__ */ jsxs("span", { className: `${compactView ? "text-xs" : "text-sm"} truncate font-bold`, children: [
                        "Logout ",
                        getUserFirstName()
                      ] })
                    ]
                  }
                ),
                currentUser && /* @__PURE__ */ jsx(FocusPausePair, { currentUser, fullWidth: true, compact: compactView }),
                currentUser && /* @__PURE__ */ jsx("div", { className: "mt-2 flex w-full min-w-0 justify-center overflow-hidden", children: /* @__PURE__ */ jsx(TimeTracker, { position: "side", hasSideBar: true, hasTopBar: !isSideNav }) }),
                isUserAdmin(currentUser) && /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: () => setShowAnnouncementManager(true),
                    className: `ccs-glass-control ccs-glass-red w-full flex items-center justify-center rounded-xl text-red-200 ${compactView ? "h-7 gap-1 text-xs" : "h-9 gap-2 text-sm"}`,
                    title: "Announcements (Admin)",
                    children: [
                      /* @__PURE__ */ jsx(Megaphone, { className: "w-4 h-4 text-red-600" }),
                      /* @__PURE__ */ jsx("span", { className: `${compactView ? "text-[11px]" : "text-sm"} font-bold`, children: "Announce" })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: `flex ${compactView ? "gap-1" : "gap-2"}`, children: [
                  /* @__PURE__ */ jsxs(
                    Link,
                    {
                      to: createPageUrl("TimeClock"),
                      className: `ccs-glass-control ccs-glass-green flex flex-1 items-center justify-center rounded-xl text-emerald-200 ${compactView ? "h-7 gap-1 px-1.5 text-[11px]" : "gap-2 px-3 py-2 text-sm"}`,
                      children: [
                        /* @__PURE__ */ jsx(Home, { className: "w-4 h-4 text-green-600" }),
                        /* @__PURE__ */ jsx("span", { className: `${compactView ? "text-[11px]" : "text-sm"} font-bold`, children: "Time Clock" })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs(
                    "button",
                    {
                      type: "button",
                      onClick: () => setShowAddTaskDialog(true),
                      className: `ccs-glass-control ccs-glass-blue flex flex-1 items-center justify-center rounded-xl text-blue-200 ${compactView ? "h-7 gap-1 px-1.5 text-[11px]" : "gap-2 px-3 py-2 text-sm"}`,
                      children: [
                        /* @__PURE__ */ jsx(ClipboardList, { className: "w-4 h-4 text-blue-600" }),
                        /* @__PURE__ */ jsx("span", { className: `${compactView ? "text-[11px]" : "text-sm"} font-bold`, children: "+ Task" })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5", children: [
                  /* @__PURE__ */ jsx(GlobalSearch, { className: "w-full justify-center", compact: compactView, shellGlass: true }),
                  /* @__PURE__ */ jsx(AttentionBell, { compact: compactView, shellGlass: true })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsx(
              "div",
              {
                className: `flex-1 overflow-y-auto ${compactView ? "px-1.5 py-1" : "px-3 py-2"}`,
                onContextMenu: handleBarContextMenu,
                children: /* @__PURE__ */ jsx(DragDropContext, { onDragEnd: handleNavReorder, onDragStart: handleNavDragStart, children: /* @__PURE__ */ jsx(Droppable, { droppableId: "page-nav-side", direction: "vertical", isCombineEnabled: true, children: (provided) => /* @__PURE__ */ jsxs(
                  "div",
                  {
                    ref: provided.innerRef,
                    ...provided.droppableProps,
                    className: compactView ? "space-y-0.5" : "space-y-1",
                    children: [
                      topEntries.map((entry, index) => {
                        if (entry.type === "folder") {
                          const folder = entry.folder;
                          return /* @__PURE__ */ jsx(Draggable, { draggableId: `sfolder:${folder.id}`, index, children: (dragProvided) => /* @__PURE__ */ jsx(
                            "div",
                            {
                              ref: dragProvided.innerRef,
                              ...dragProvided.draggableProps,
                              ...dragProvided.dragHandleProps,
                              style: dragProvided.draggableProps.style,
                              children: /* @__PURE__ */ jsx(
                                SidebarNavGroup,
                                {
                                  label: folder.name,
                                  items: folderItems(folder),
                                  collapsed: !!collapsedGroups[folder.id] || isShortShell,
                                  onToggle: () => toggleNavGroup(folder.id),
                                  compactView,
                                  activePath: location.pathname,
                                  isInSplitUrl: isInSplitView,
                                  onNavigate: handleNavClick,
                                  accent: folder.color,
                                  stylePreset: folder.style,
                                  onContextMenuGroup: ({ x, y }) => setNavMenu({ x, y, kind: "folder", folderId: folder.id }),
                                  onContextMenuItem: (item2, { x, y }) => setNavMenu({ x, y, kind: "page", url: item2.url })
                                }
                              )
                            }
                          ) }, `sfolder:${folder.id}`);
                        }
                        const item = barItemByUrl.get(entry.url);
                        if (!item) return null;
                        return /* @__PURE__ */ jsx(Draggable, { draggableId: `side-${item.url}`, index, children: (dragProvided) => /* @__PURE__ */ jsx(
                          NavPageLink,
                          {
                            item,
                            variant: "side",
                            compactView,
                            isActive: location.pathname === item.url,
                            isInSplit: isInSplitView(item),
                            onNavigate: (event) => handleNavClick(event, item),
                            onContextMenuItem: (itm, { x, y }) => setNavMenu({ x, y, kind: "page", url: itm.url }),
                            dragRef: dragProvided.innerRef,
                            dragProps: dragProvided.draggableProps,
                            dragHandleProps: dragProvided.dragHandleProps
                          }
                        ) }, item.url);
                      }),
                      provided.placeholder
                    ]
                  }
                ) }) })
              }
            )
          ]
        }
      ),
      !isSideNav && /* @__PURE__ */ jsx(
        motion.nav,
        {
          ref: topNavRef,
          initial: false,
          animate: {
            y: effectiveCollapsed && !isHovered ? -(topNavHeight - collapsedRail) : 0,
            opacity: effectiveCollapsed && !isHovered ? 0.94 : 1
          },
          transition: shellTransition,
          className: "top-nav ccs-glass-shell fixed left-0 right-0 top-0 z-50 overflow-visible",
          children: /* @__PURE__ */ jsxs("div", { className: topBarCompact ? "px-2 py-1" : "px-4 py-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "ccs-topbar-layout", "data-compact": compactView, children: [
              /* @__PURE__ */ jsxs("div", { className: "ccs-topbar-brand", children: [
                /* @__PURE__ */ jsxs("div", { className: `ccs-glass-panel flex items-center ${topBarCompact ? "gap-1.5 rounded-xl px-1.5 py-1" : "gap-2 rounded-2xl px-3 py-2 sm:gap-3 sm:px-4"}`, children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => setNavLayout(navLayout === "top" ? "side" : "top"),
                      className: `ccs-glass-control ccs-glass-purple flex items-center justify-center text-violet-200 ${topBarCompact ? "h-6 w-6 rounded-lg" : "h-8 w-8 rounded-xl sm:h-10 sm:w-10 sm:rounded-2xl"}`,
                      title: "Switch to Sidebar",
                      children: /* @__PURE__ */ jsx(PanelLeft, { className: topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4 sm:h-5 sm:w-5" })
                    }
                  ),
                  /* @__PURE__ */ jsxs("div", { className: "hidden sm:block", children: [
                    /* @__PURE__ */ jsx("h2", { className: `${topBarCompact ? "text-xs" : "text-lg"} font-bold leading-tight text-white`, children: "Sign Shop" }),
                    !topBarCompact && /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-300", children: "Workflow Manager" })
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  ShellViewControls,
                  {
                    compactView,
                    onToggleCompact: () => setCompactView((value) => !value),
                    collapsed: navCollapsed,
                    onToggleCollapsed: () => {
                      setNavCollapsed((value) => !value);
                      setIsHovered(false);
                    },
                    navLayout: "top"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  className: "ccs-topbar-menu lg:hidden clay-button p-2 min-h-[40px] min-w-[40px]",
                  onClick: () => setMobileMenuOpen(!mobileMenuOpen),
                  "aria-expanded": mobileMenuOpen,
                  "aria-label": mobileMenuOpen ? "Close navigation menu" : "Open navigation menu",
                  title: mobileMenuOpen ? "Close menu" : "Open menu",
                  children: mobileMenuOpen ? /* @__PURE__ */ jsx(X, { className: "w-6 h-6" }) : /* @__PURE__ */ jsx(Menu, { className: "w-6 h-6" })
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: `ccs-topbar-utilities hidden md:flex flex-wrap items-center ${topBarCompact ? "gap-1" : "gap-2"}`, children: [
                /* @__PURE__ */ jsxs("div", { className: `flex flex-wrap items-stretch ${topBarCompact ? "gap-1" : "gap-2"}`, children: [
                  !currentUser ? /* @__PURE__ */ jsxs(
                    "button",
                    {
                      type: "button",
                      "data-login-gate-allow": true,
                      onClick: showLoginDialog,
                      className: `ccs-glass-control ccs-glass-purple flex items-center rounded-xl text-violet-200 ${topBarCompact ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`,
                      title: "Sign In",
                      children: [
                        /* @__PURE__ */ jsx(LogIn, { className: topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4" }),
                        /* @__PURE__ */ jsx("span", { className: `${topBarCompact ? "text-[11px]" : "text-sm"} font-bold`, children: "Sign In" })
                      ]
                    }
                  ) : /* @__PURE__ */ jsxs(
                    "button",
                    {
                      type: "button",
                      "data-login-gate-allow": true,
                      onClick: logout,
                      className: `ccs-glass-control ccs-glass-neutral flex items-center rounded-xl text-slate-100 ${topBarCompact ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`,
                      title: `Logout ${getUserFirstName()}`,
                      children: [
                        /* @__PURE__ */ jsx(LogOut, { className: topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4" }),
                        /* @__PURE__ */ jsx("span", { className: `${topBarCompact ? "text-[11px]" : "text-sm"} font-bold`, children: "Logout" })
                      ]
                    }
                  ),
                  currentUser && /* @__PURE__ */ jsx(FocusPausePair, { currentUser, compact: topBarCompact }),
                  currentUser && /* @__PURE__ */ jsx(TimeTracker, { position: "top", hasTopBar: true, hasSideBar: isSideNav || isMobile }),
                  isUserAdmin(currentUser) && /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => setShowAnnouncementManager(true),
                      className: `ccs-glass-control ccs-glass-red flex flex-shrink-0 items-center justify-center rounded-xl text-red-200 ${topBarCompact ? "h-7 w-8" : "w-11 self-stretch"}`,
                      title: "Announcements (Admin)",
                      children: /* @__PURE__ */ jsx(Megaphone, { className: topBarCompact ? "h-3.5 w-3.5" : "h-5 w-5" })
                    }
                  ),
                  /* @__PURE__ */ jsxs(
                    Link,
                    {
                      to: createPageUrl("TimeClock"),
                      className: `ccs-glass-control ccs-glass-green flex items-center rounded-xl text-emerald-200 ${topBarCompact ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`,
                      children: [
                        /* @__PURE__ */ jsx(Home, { className: topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4" }),
                        /* @__PURE__ */ jsx("span", { className: `${topBarCompact ? "text-[11px]" : "text-sm"} font-bold`, children: "Time Clock" })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs(
                    "button",
                    {
                      type: "button",
                      onClick: () => setShowAddTaskDialog(true),
                      className: `ccs-glass-control ccs-glass-blue flex items-center rounded-xl text-blue-200 ${topBarCompact ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`,
                      children: [
                        /* @__PURE__ */ jsx(ClipboardList, { className: topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4" }),
                        /* @__PURE__ */ jsx("span", { className: `${topBarCompact ? "text-[11px]" : "text-sm"} font-bold`, children: "+ Task" })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5", children: [
                  /* @__PURE__ */ jsx(GlobalSearch, { className: topBarCompact ? "w-[116px] justify-center" : "w-56 justify-center", compact: topBarCompact, shellGlass: true }),
                  /* @__PURE__ */ jsx(AttentionBell, { compact: topBarCompact, shellGlass: true })
                ] })
              ] }),
              /* @__PURE__ */ jsx(
                "div",
                {
                  "data-top-navigation-links": true,
                  "data-manual-compact": compactView,
                  onContextMenu: handleBarContextMenu,
                  className: `ccs-topbar-links hidden lg:flex flex-wrap items-center ${topBarCompact ? "gap-0.5" : "gap-1"}`,
                  children: /* @__PURE__ */ jsx(DragDropContext, { onDragEnd: handleNavReorder, onDragStart: handleNavDragStart, children: /* @__PURE__ */ jsx(Droppable, { droppableId: "page-nav-top", direction: "horizontal", isCombineEnabled: true, children: (provided) => /* @__PURE__ */ jsxs(
                    "div",
                    {
                      ref: provided.innerRef,
                      ...provided.droppableProps,
                      className: `flex flex-wrap items-center ${topBarCompact ? "gap-0.5" : "gap-1"}`,
                      children: [
                        topEntries.map((entry, index) => {
                          if (entry.type === "folder") {
                            const folder = entry.folder;
                            const FolderIcon = folderIconFor(folder.icon);
                            return /* @__PURE__ */ jsx(Draggable, { draggableId: folderToken(folder.id), index, children: (dragProvided) => /* @__PURE__ */ jsx(
                              "div",
                              {
                                ref: dragProvided.innerRef,
                                ...dragProvided.draggableProps,
                                ...dragProvided.dragHandleProps,
                                style: dragProvided.draggableProps.style,
                                className: "rounded-lg",
                                children: /* @__PURE__ */ jsx(
                                  NavFlyoutMenu,
                                  {
                                    label: folder.name,
                                    icon: FolderIcon,
                                    accent: folder.color,
                                    stylePreset: folder.style,
                                    folderId: folder.id,
                                    items: folderItems(folder),
                                    compactView,
                                    activePath: location.pathname,
                                    isInSplitUrl: isInSplitView,
                                    onNavigate: handleNavClick,
                                    onContextMenuPill: ({ x, y }) => setNavMenu({ x, y, kind: "folder", folderId: folder.id }),
                                    onContextMenuItem: (item2, { x, y }) => setNavMenu({ x, y, kind: "page", url: item2.url })
                                  }
                                )
                              }
                            ) }, folderToken(folder.id));
                          }
                          const item = barItemByUrl.get(entry.url);
                          if (!item) return null;
                          return /* @__PURE__ */ jsx(Draggable, { draggableId: `top-${item.url}`, index, children: (dragProvided) => /* @__PURE__ */ jsx(
                            NavPageLink,
                            {
                              item,
                              variant: "top",
                              compactView,
                              isActive: location.pathname === item.url,
                              isInSplit: isInSplitView(item),
                              onNavigate: (event) => handleNavClick(event, item),
                              onContextMenuItem: (itm, { x, y }) => setNavMenu({ x, y, kind: "page", url: itm.url }),
                              dragRef: dragProvided.innerRef,
                              dragProps: dragProvided.draggableProps,
                              dragHandleProps: dragProvided.dragHandleProps
                            }
                          ) }, item.url);
                        }),
                        provided.placeholder
                      ]
                    }
                  ) }) })
                }
              )
            ] }),
            mobileMenuOpen && /* @__PURE__ */ jsx("div", { className: "lg:hidden mt-2 border-t border-gray-200 pt-2", children: /* @__PURE__ */ jsx("div", { className: "ccs-topbar-menu-grid grid grid-cols-3 gap-1", children: [...ALL_NAV_PAGES.keys()].map((u) => styledPage(u)).filter((item) => item && !navHidden.includes(item.url)).map((item) => {
              const isActive = location.pathname === item.url;
              const isInSplit = additionalPages.find((p) => item.url.includes(p.name));
              return /* @__PURE__ */ jsxs(
                Link,
                {
                  to: item.url,
                  onClick: (e) => {
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      const pageName = item.url.split("/").pop();
                      addPage(pageName, item.title);
                    }
                    setMobileMenuOpen(false);
                  },
                  className: `ccs-glass-nav-item flex min-h-[36px] min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 ${isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""}`,
                  style: { "--glass-accent-rgb": hexToRgbTuple(item.accent) },
                  title: "Ctrl+Click to open in split view",
                  children: [
                    /* @__PURE__ */ jsx(item.icon, { className: "h-5 w-5 flex-shrink-0", style: { color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : void 0 } }),
                    /* @__PURE__ */ jsx("span", { className: `text-base font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`, children: item.title }),
                    isInSplit && /* @__PURE__ */ jsx(Columns, { className: "w-4 h-4 text-purple-500" })
                  ]
                },
                item.title
              );
            }) }) })
          ] })
        }
      ),
      isMobile && !isRootRoute && /* @__PURE__ */ jsx(
        "div",
        {
          className: "fixed top-0 left-0 right-0 z-50 flex items-center px-3 bg-white/95 backdrop-blur-sm border-b border-gray-200",
          style: { height: "48px", paddingTop: "env(safe-area-inset-top)", background: darkMode ? "rgba(20,20,40,0.97)" : void 0, borderColor: darkMode ? "rgba(255,255,255,0.1)" : void 0 },
          children: /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => navigate(-1),
              className: "flex items-center gap-1 text-purple-700 font-medium text-sm min-h-[44px] min-w-[44px] -ml-1",
              style: { userSelect: "none" },
              children: [
                /* @__PURE__ */ jsx(ChevronLeft, { className: "w-5 h-5" }),
                "Back"
              ]
            }
          )
        }
      ),
      /* @__PURE__ */ jsx(
        motion.main,
        {
          ref: mainRef,
          initial: false,
          animate: {
            paddingTop: isMobile ? isRootRoute ? 0 : 48 : isSideNav ? 0 : effectiveCollapsed ? collapsedRail + 4 : topNavHeight,
            marginLeft: isSideNav ? effectiveCollapsed ? collapsedRail : sideNavWidth : 0
          },
          transition: isMobile ? { duration: 0.01 } : shellTransition,
          className: `flex-1 main-scroll-container ${isMobile ? "main-content-mobile" : ""}`,
          style: {
            height: "100vh",
            overflow: "auto"
          },
          children: /* @__PURE__ */ jsx(MultiPageContext.Provider, { value: { addPage, removePage, clearPages, isInMultiView, additionalPages }, children: /* @__PURE__ */ jsx(
            MultiPageContainer,
            {
              additionalPages: isMobile ? [] : additionalPages,
              onRemovePage: removePage,
              onClearAll: clearPages,
              orientation,
              onToggleOrientation: toggleOrientation,
              children: isMobile ? /* @__PURE__ */ jsx(AnimatePresence, { mode: "wait", initial: false, children: /* @__PURE__ */ jsx(
                motion.div,
                {
                  initial: { x: 40, opacity: 0 },
                  animate: { x: 0, opacity: 1 },
                  exit: { x: -40, opacity: 0 },
                  transition: { duration: 0.18, ease: "easeInOut" },
                  style: { minHeight: "100%" },
                  children: /* @__PURE__ */ jsx(LoginGate, { exempt: location.pathname.replace(/\/+$/, "").toLowerCase() === "/timeclock", children })
                },
                location.pathname
              ) }) : /* @__PURE__ */ jsx(
                motion.div,
                {
                  initial: reduceMotion ? false : { opacity: 0, y: 8 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.18, ease: "easeOut" },
                  style: { minHeight: "100%" },
                  children: /* @__PURE__ */ jsx(LoginGate, { exempt: location.pathname.replace(/\/+$/, "").toLowerCase() === "/timeclock", children })
                },
                location.pathname
              )
            }
          ) })
        }
      ),
      /* @__PURE__ */ jsx(SyncConflictAlert, { currentUser, sessionToken }),
      /* @__PURE__ */ jsx(
        SmartsheetSyncWidget,
        {
          compactOrderForm: location.pathname.replace(/\/+$/, "").toLowerCase() === "/orderform",
          sessionToken,
          currentUser
        }
      ),
      /* @__PURE__ */ jsx(
        AddTaskDialog,
        {
          isOpen: showAddTaskDialog,
          onClose: () => setShowAddTaskDialog(false)
        }
      ),
      navMenu && /* @__PURE__ */ jsx(
        NavContextMenu,
        {
          x: navMenu.x,
          y: navMenu.y,
          onClose: () => setNavMenu(null),
          items: navMenu.kind === "bar" ? [{ icon: FolderPlus, label: "New folder", onClick: () => openFolderEditor(null, true) }] : navMenu.kind === "folder" ? [
            { icon: PencilLine, label: "Edit folder", onClick: () => openFolderEditor(navMenu.folderId) },
            { icon: Trash2, label: "Delete folder", danger: true, onClick: () => handleDeleteFolder(navMenu.folderId) }
          ] : [
            { icon: PencilLine, label: "Edit button", onClick: () => openPageEditor(navMenu.url) }
          ]
        }
      ),
      navEditor && navEditor.mode === "folder" && (() => {
        const folder = navEditor.isNew ? null : effectiveFolders.find((f) => f.id === navEditor.folderId);
        return /* @__PURE__ */ jsx(
          NavItemEditor,
          {
            mode: "folder",
            title: navEditor.isNew ? "New folder" : `Edit folder`,
            name: folder?.name || "New Folder",
            color: folder?.color || "#8B5CF6",
            style: folder?.style || "glass",
            icon: folder?.icon || "Folder",
            allowDelete: !navEditor.isNew,
            onSave: (patch) => handleSaveFolder(navEditor.folderId, navEditor.isNew, patch),
            onDelete: () => handleDeleteFolder(navEditor.folderId),
            onClose: () => setNavEditor(null)
          }
        );
      })(),
      navEditor && navEditor.mode === "page" && (() => {
        const base = ALL_NAV_PAGES.get(navEditor.url);
        if (!base) return null;
        const override = pageStyles[navEditor.url] || {};
        return /* @__PURE__ */ jsx(
          NavItemEditor,
          {
            mode: "page",
            title: `Edit \u201C${base.title}\u201D button`,
            name: override.name || base.title,
            color: override.color || base.accent,
            style: override.style || "glass",
            allowReset: Boolean(pageStyles[navEditor.url]),
            onSave: (patch) => handleSavePage(navEditor.url, patch),
            onReset: () => handleResetPage(navEditor.url),
            onClose: () => setNavEditor(null)
          }
        );
      })(),
      isUserAdmin(currentUser) && /* @__PURE__ */ jsx(
        AnnouncementManager,
        {
          isOpen: showAnnouncementManager,
          onClose: () => setShowAnnouncementManager(false),
          sessionToken
        }
      ),
      /* @__PURE__ */ jsx(AnnouncementBanner, {}),
      !isFullscreen && !isMobile && /* @__PURE__ */ jsxs(
        "div",
        {
          className: "fixed bottom-3 left-3 z-50 flex gap-1 opacity-20 hover:opacity-100 transition-opacity duration-200",
          style: { marginLeft: isSideNav ? effectiveCollapsed ? `${collapsedRail}px` : `${sideNavWidth}px` : "0" },
          children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: toggleFullScreen,
                className: "px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors",
                style: { background: "rgba(191, 219, 254, 0.8)", color: "#1e40af" },
                title: "Toggle Fullscreen",
                children: /* @__PURE__ */ jsx(Maximize2, { className: "w-3 h-3" })
              }
            ),
            isRegistered && /* @__PURE__ */ jsxs(
              Link,
              {
                to: createPageUrl("FeatureReports"),
                className: "px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors",
                style: { background: "rgba(191, 219, 254, 0.8)", color: "#1e40af" },
                children: [
                  /* @__PURE__ */ jsx(Lightbulb, { className: "w-3 h-3" }),
                  /* @__PURE__ */ jsx("span", { children: "Reports" })
                ]
              }
            ),
            isUserAdmin(currentUser) && /* @__PURE__ */ jsxs(
              Link,
              {
                to: createPageUrl("AdminSettings"),
                className: "px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors",
                style: { background: "rgba(191, 219, 254, 0.8)", color: "#1e40af" },
                children: [
                  /* @__PURE__ */ jsx(Settings, { className: "w-3 h-3" }),
                  /* @__PURE__ */ jsx("span", { children: "Admin" })
                ]
              }
            ),
            isRegistered && /* @__PURE__ */ jsxs(
              Link,
              {
                to: createPageUrl("UserSettings"),
                className: "px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors",
                style: { background: "rgba(191, 219, 254, 0.8)", color: "#1e40af" },
                children: [
                  /* @__PURE__ */ jsx(User, { className: "w-3 h-3" }),
                  /* @__PURE__ */ jsx("span", { children: "My Info" })
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              "div",
              {
                className: "px-2 py-1 flex items-center gap-1 text-xs rounded-md",
                style: { background: "rgba(191, 219, 254, 0.8)" },
                title: "Toggle Dark Mode",
                children: /* @__PURE__ */ jsx(
                  DarkModeSwitch,
                  {
                    checked: darkMode,
                    onChange: setDarkMode,
                    size: 16
                  }
                )
              }
            ),
            additionalPages.length > 0 && /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: clearPages,
                className: "px-2 py-1 flex items-center gap-1 text-xs rounded-md transition-colors",
                style: { background: "rgba(254, 202, 202, 0.8)", color: "#991b1b" },
                title: "Clear split view",
                children: [
                  /* @__PURE__ */ jsx(X, { className: "w-3 h-3" }),
                  /* @__PURE__ */ jsx("span", { children: "Clear Split" })
                ]
              }
            )
          ]
        }
      ),
      isMobile && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(
          "nav",
          {
            className: "mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 flex border-t border-gray-200",
            style: {
              background: darkMode ? "rgba(20,20,40,0.97)" : "rgba(255,255,255,0.97)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
              height: "calc(64px + env(safe-area-inset-bottom))"
            },
            children: [
              [
                { label: "My Workflow", icon: User, url: createPageUrl("MyWorkflow") },
                { label: "Sales", icon: DollarSign, url: createPageUrl("SalesPipeline") },
                { label: "Timeclock", icon: Clock, url: createPageUrl("TimeClock") },
                currentUser ? { label: "Settings", icon: Settings, url: createPageUrl("UserSettings") } : { label: "Sign In", icon: LogIn, action: showLoginDialog }
              ].map((item) => {
                if (item.action) {
                  return /* @__PURE__ */ jsxs(
                    "button",
                    {
                      type: "button",
                      "data-login-gate-allow": true,
                      onClick: item.action,
                      className: "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                      style: { minHeight: "44px", userSelect: "none", color: "#7C3AED" },
                      children: [
                        /* @__PURE__ */ jsx(item.icon, { className: "w-5 h-5" }),
                        /* @__PURE__ */ jsx("span", { className: "text-xs font-medium", children: item.label })
                      ]
                    },
                    item.label
                  );
                }
                const isActive = location.pathname === item.url;
                return /* @__PURE__ */ jsxs(
                  Link,
                  {
                    to: item.url,
                    onClick: (e) => {
                      if (isActive) {
                        e.preventDefault();
                        navigate(item.url, { replace: true });
                        window.scrollTo(0, 0);
                      }
                      setMobileMenuOpen(false);
                    },
                    className: "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                    style: { minHeight: "44px", userSelect: "none", color: isActive ? "#7C3AED" : "#6B7280" },
                    children: [
                      /* @__PURE__ */ jsx(item.icon, { className: "w-5 h-5" }),
                      /* @__PURE__ */ jsx("span", { className: "text-xs font-medium", children: item.label })
                    ]
                  },
                  item.label
                );
              }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => setMobileMenuOpen(!mobileMenuOpen),
                  className: "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                  style: { minHeight: "44px", userSelect: "none", color: mobileMenuOpen ? "#7C3AED" : "#6B7280" },
                  children: [
                    /* @__PURE__ */ jsx(Menu, { className: "w-5 h-5" }),
                    /* @__PURE__ */ jsx("span", { className: "text-xs font-medium", children: "More" })
                  ]
                }
              )
            ]
          }
        ),
        mobileMenuOpen && /* @__PURE__ */ jsx(
          "div",
          {
            className: "ccs-glass-shell fixed inset-0 z-40",
            style: { paddingBottom: "calc(64px + env(safe-area-inset-bottom))" },
            children: /* @__PURE__ */ jsxs("div", { className: "h-full overflow-y-auto p-4 pt-6", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
                /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-white", children: "All Pages" }),
                /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setMobileMenuOpen(false), className: "ccs-glass-control ccs-glass-neutral rounded-lg p-2 text-slate-100", children: /* @__PURE__ */ jsx(X, { className: "h-5 w-5" }) })
              ] }),
              currentUser && /* @__PURE__ */ jsxs("div", { className: "mb-3 space-y-2", children: [
                /* @__PURE__ */ jsx(FocusPausePair, { currentUser, fullWidth: true, compact: true }),
                /* @__PURE__ */ jsx("div", { className: "flex w-full min-w-0 justify-center overflow-hidden", children: /* @__PURE__ */ jsx(TimeTracker, { position: "side", hasSideBar: true, hasTopBar: !isSideNav }) })
              ] }),
              isUserAdmin(currentUser) && /* @__PURE__ */ jsxs("div", { className: "mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2", children: [
                /* @__PURE__ */ jsxs(
                  Link,
                  {
                    to: createPageUrl("AdminSettings"),
                    onClick: () => setMobileMenuOpen(false),
                    className: "px-4 py-3 rounded-xl flex items-center gap-3 min-h-[48px] border border-indigo-200 bg-indigo-50",
                    children: [
                      /* @__PURE__ */ jsx(Settings, { className: "w-5 h-5 flex-shrink-0 text-indigo-700" }),
                      /* @__PURE__ */ jsx("span", { className: "font-semibold text-base text-indigo-900", children: "Admin Settings" })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  Link,
                  {
                    to: `${createPageUrl("AdminSettings")}?tab=smartsheet`,
                    onClick: () => setMobileMenuOpen(false),
                    className: "px-4 py-3 rounded-xl flex items-center gap-3 min-h-[48px] border border-cyan-200 bg-cyan-50",
                    children: [
                      /* @__PURE__ */ jsx(GitBranch, { className: "w-5 h-5 flex-shrink-0 text-cyan-700" }),
                      /* @__PURE__ */ jsx("span", { className: "font-semibold text-base text-cyan-900", children: "Smartsheet Sync" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-2", children: [...ALL_NAV_PAGES.keys()].map((u) => styledPage(u)).filter((item) => item && !navHidden.includes(item.url)).map((item) => {
                const isActive = location.pathname === item.url;
                return /* @__PURE__ */ jsxs(
                  Link,
                  {
                    to: item.url,
                    onClick: () => setMobileMenuOpen(false),
                    className: `ccs-glass-nav-item flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 ${isActive ? "font-bold" : ""}`,
                    style: { "--glass-accent-rgb": hexToRgbTuple(item.accent) },
                    children: [
                      /* @__PURE__ */ jsx(item.icon, { className: "h-5 w-5 flex-shrink-0", style: { color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : void 0 } }),
                      /* @__PURE__ */ jsx("span", { className: `text-base font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`, children: item.title })
                    ]
                  },
                  item.title
                );
              }) })
            ] })
          }
        )
      ] })
    ] })
  ] });
}
function LayoutContentWrapper({ children, currentPageName }) {
  const { currentUser } = useAuth();
  const internalFleetPage = String(currentPageName || "").startsWith("Fleet");
  const protectedChildren = internalFleetPage && !currentUser ? /* @__PURE__ */ jsx("div", { className: "min-h-[60vh] flex items-center justify-center p-6", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-lg font-bold text-gray-900 dark:text-slate-100", children: "Fleet sign-in required" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-gray-600 dark:text-slate-300", children: "Sign in to CCS to view Fleet equipment, tracking, maintenance, inventory, costs, or other internal Fleet information." })
  ] }) }) : children;
  return /* @__PURE__ */ jsx(ImportProgressProvider, { currentUserEmail: currentUser?.email, children: /* @__PURE__ */ jsx(TimeClockStatusProvider, { children: /* @__PURE__ */ jsx(ResearchProgressProvider, { children: /* @__PURE__ */ jsx(MultiImportProvider, { children: /* @__PURE__ */ jsxs(AnnouncementProvider, { currentPageName, children: [
    /* @__PURE__ */ jsx(LayoutContent, { children: protectedChildren }),
    /* @__PURE__ */ jsx(ResearchProgressBar, {})
  ] }) }) }) }) });
}
export default function Layout({ children, currentPageName }) {
  return /* @__PURE__ */ jsx(AuthProvider, { children: /* @__PURE__ */ jsx(WorkspacePreferencesProvider, { children: /* @__PURE__ */ jsx(LayoutContentWrapper, { currentPageName, children }) }) });
}
