import { useState, useEffect, useMemo, useCallback, createContext, useContext, useRef, Fragment } from "react";
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
  Trash2,
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
import SyncConflictAlert from '@/components/admin/SyncConflictAlert';
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
  tokenFolderId,
} from "@/components/layout/navCustomization";
import {
  applyNavOrder,
  hexToRgbTuple,
  loadCollapsedGroups,
  loadNavOrder,
  saveCollapsedGroups,
  saveNavOrder,
} from "@/components/layout/navPreferences";
import { useWorkspacePreferences, WorkspacePreferencesProvider } from "@/components/layout/WorkspacePreferencesProvider";

// Context for multi-page view
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
  { title: "Fleet", url: createPageUrl("FleetOverview"), icon: NavigationIcon, accent: "#22D3EE" },
];

const meetingsNavItems = [
  { title: "SIPs", url: createPageUrl("SIPs"), icon: ClipboardList, accent: "#FACC15" },
  { title: "Monday Meeting", url: createPageUrl("MondayMorningMeeting"), icon: ClipboardList, accent: "#A3E635" },
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
  { title: "Reconciliation", url: createPageUrl("Reconciliation"), icon: Scale, accent: "#34D399" },
];

// Every routable nav page, keyed by url — folder contents resolve through this.
const ALL_NAV_PAGES = new Map(
  [...navigationItems, ...meetingsNavItems, ...reportsNavItems].map((item) => [item.url, item])
);

// Built-in folders are the seed for prefs.navigation.folders — editable like
// user folders (rename/recolor/restyle/move pages/delete) once customized.
const BUILTIN_NAV_FOLDERS = [
  { id: "meetings", name: "Meetings", icon: "Calendar", color: "#FACC15", style: "glass", items: meetingsNavItems.map((i) => i.url) },
  { id: "reports", name: "Reports", icon: "BarChart3", color: "#8B5CF6", style: "glass", items: reportsNavItems.map((i) => i.url) },
];

// Extract the page url out of a draggable id. Page draggables end in the url
// (which always starts with "/"); folder pill draggables are "folder:<id>".
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
  mass: 0.82,
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
        className={`flex h-full min-w-0 flex-1 items-center justify-center rounded-lg font-bold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${compactView ? "gap-0.5 px-1 text-[10px] whitespace-nowrap" : "gap-1 px-1.5 text-[10px] whitespace-nowrap"} ${compactView
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
        className={`flex h-full min-w-0 flex-1 items-center justify-center rounded-lg font-bold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${compactView ? "gap-0.5 px-1 text-[10px] whitespace-nowrap" : "gap-1 px-1.5 text-[10px] whitespace-nowrap"} ${collapsed
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
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showAnnouncementManager, setShowAnnouncementManager] = useState(false);
  const { currentUser, sessionToken, isRegistered, logout, getUserFirstName, showLoginDialog } = useAuth();
  const { prefs: workspacePrefs, reportNavOrder, updatePrefs: updateWorkspacePrefs, loaded: workspacePrefsLoaded } = useWorkspacePreferences();
  const navPrefs = workspacePrefs.navigation || {};
  const navHidden = navPrefs.hidden || [];
  
  // Multi-page view state
  const { additionalPages, addPage, removePage, clearPages, isInMultiView, orientation, toggleOrientation } = useMultiPageView();

  // Per-user page-button order (drag and drop) and collapsed nav groups.
  const [navOrder, setNavOrder] = useState(() => loadNavOrder(currentUser?.email));
  // Collapsed-group memory lives in the workspace blob (cross-device); the
  // legacy localStorage copy is only a pre-hydration fallback.
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

  // Tab title fallback: pages that set their own title override this once mounted.
  useEffect(() => {
    const segment = (location.pathname || "/").split("/").filter(Boolean).pop() || "MyWorkflow";
    const name = segment.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").trim();
    document.title = name + " - Workflow Manager";
  }, [location.pathname]);

  const orderedNavItems = useMemo(() => applyNavOrder(navigationItems, navOrder), [navOrder]);
  // Hidden buttons are a render filter only — order/permissions untouched.
  const visibleNavItems = useMemo(() => orderedNavItems.filter((i) => !navHidden.includes(i.url)), [orderedNavItems, navHidden]);

  // ---- User nav customization: folders + page styles ----
  // navPrefs.folders: null → built-ins; array → user's own folder set.
  const effectiveFolders = useMemo(
    () => sanitizeFolders(navPrefs.folders) ?? BUILTIN_NAV_FOLDERS,
    [navPrefs.folders]
  );
  const pageStyles = useMemo(() => sanitizePageStyles(navPrefs.pageStyles), [navPrefs.pageStyles]);
  const folderMemberUrls = useMemo(
    () => new Set(effectiveFolders.flatMap((f) => f.items)),
    [effectiveFolders]
  );
  // Pages eligible for top-level: not inside a folder, not hidden.
  const barPageUrls = useMemo(
    () => new Set(navigationItems.map((i) => i.url).filter((u) => !folderMemberUrls.has(u) && !navHidden.includes(u))),
    [folderMemberUrls, navHidden]
  );
  const topEntries = useMemo(
    () => resolveTopLevel(navOrder, effectiveFolders, barPageUrls),
    [navOrder, effectiveFolders, barPageUrls]
  );
  // Page button with user style overrides applied.
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

  const [navMenu, setNavMenu] = useState(null);   // {x,y,kind:'bar'|'folder'|'page', folderId?, url?}
  const [navEditor, setNavEditor] = useState(null); // {mode:'folder'|'page', isNew?, folderId?, url?}
  // Drag state lives in a plain global — NO React state may change during a
  // drag lifecycle (onDragStart/Update re-renders mid-flight can kill the
  // active drag with "Cannot stop drag when no active drag").
  const navDragFlag = (v) => { if (v === undefined) return window.__ccsNavDragging; window.__ccsNavDragging = v; };

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

  // Freeze nav layout on any potential drag press. A lifting page leaves the
  // flex-wrap flow → the bar reflows chaotically and drop targets slide out
  // from under the pointer ("can't get pages into folders"). Absolute-pinning
  // every nav draggable at its current spot keeps all targets dead still for
  // the whole drag; ancestor boxes are fixed-positioned too, so a collapsing
  // grid/flex parent can't drag the frozen region to new coordinates. Pure
  // DOM — no React state — so the drag lifecycle is never disturbed; styles
  // are restored verbatim on release.
  useEffect(() => {
    const FROZEN = "ccs-nav-frozen";
    const POS_PROPS = ["position", "left", "top", "right", "bottom", "width", "height",
      "minWidth", "minHeight", "margin", "zIndex", "flexShrink", "justifySelf", "alignSelf",
      "boxSizing",
      // Containing-block creators — cleared on the drag source's ancestor
      // chain so the ghost's position:fixed stays viewport-true (see below).
      "backdropFilter", "WebkitBackdropFilter", "filter", "perspective",
      "willChange", "contain", "containerType", "contentVisibility"];
    const saveStyle = (el) => {
      const saved = {};
      for (const k of POS_PROPS) saved[k] = el.style[k];
      return saved;
    };
    // Props that make an element a containing block for position:fixed
    // descendants (CSS Contain + Filter specs). The glass shell/panel's
    // backdrop-filter does exactly this — the ghost's fixed coords resolved
    // inside the blurred box instead of the viewport, so the dragged pill
    // floated offset from the pointer ("not tied to the mouse location").
    // Cleared for the duration of the freeze and restored verbatim.
    const CB_RESET = {
      backdropFilter: "none", WebkitBackdropFilter: "none", filter: "none",
      perspective: "none", willChange: "auto", contain: "none",
      containerType: "normal", contentVisibility: "visible",
    };
    const clearContainingBlock = (el) => { for (const k in CB_RESET) el.style[k] = CB_RESET[k]; };
    const freezeAll = (root, dragEl) => {
      // The scope element itself may BE a droppable (open flyout menu) —
      // querySelectorAll only matches descendants.
      const drops = root.matches?.("[data-rfd-droppable-id]")
        ? [root, ...root.querySelectorAll("[data-rfd-droppable-id]")]
        : [...root.querySelectorAll("[data-rfd-droppable-id]")];
      for (const dropEl of drops) {
        if (dropEl.__ccsFrozen) continue;
        dropEl.__ccsFrozen = true;
        const isSourceDrop = dropEl.contains(dragEl);
        // Measure EVERYTHING before mutating — each style change can reflow
        // siblings, so lazy measurement would corrupt the offsets.
        const rect = dropEl.getBoundingClientRect();
        const els = [...dropEl.querySelectorAll("[data-rfd-draggable-id]")];
        const rects = els.map((el) => el.getBoundingClientRect());
        // Ancestor chain up to the nearest already-fixed/sticky element (or
        // <body>): those boxes must not relayout under the frozen region.
        const anchors = [];
        let p = dropEl.parentElement;
        while (p && p !== document.body) {
          const cs = getComputedStyle(p);
          const r = p.getBoundingClientRect();
          anchors.push([p, r, cs.position]);
          if (cs.position === "fixed" || cs.position === "sticky") break;
          p = p.parentElement;
        }
        // --- apply pass ---
        for (const [a, r, pos] of anchors) {
          a.__ccsSavedStyle = saveStyle(a);
          a.__ccsPinned = true;
          if (isSourceDrop) clearContainingBlock(a);
          if (pos === "fixed" || pos === "sticky") {
            a.style.width = `${r.width}px`;
            a.style.height = `${r.height}px`;
            a.style.minWidth = `${r.width}px`;
            a.style.minHeight = `${r.height}px`;
            continue;
          }
          a.style.position = "fixed";
          a.style.margin = "0";
          a.style.left = "0px";
          a.style.top = "0px";
          // Correct for whichever containing block the fixed box resolved to.
          const r2 = a.getBoundingClientRect();
          const cs2 = getComputedStyle(a);
          a.style.left = `${parseFloat(cs2.left) + (r.left - r2.left)}px`;
          a.style.top = `${parseFloat(cs2.top) + (r.top - r2.top)}px`;
          a.style.width = `${r.width}px`;
          a.style.height = `${r.height}px`;
          a.style.zIndex = "60";
        }
        dropEl.__ccsAnchors = anchors.map(([a]) => a);
        dropEl.__ccsSavedStyle = saveStyle(dropEl);
        dropEl.classList.add(FROZEN);
        if (isSourceDrop) clearContainingBlock(dropEl);
        // A portal'd droppable (open flyout menu) is already position:fixed —
        // forcing relative here would teleport it to the flow origin.
        if (getComputedStyle(dropEl).position !== "fixed") dropEl.style.position = "relative";
        // Pin BOTH dims — once the children leave flow the container would
        // otherwise collapse to 0x0 and stop being a hit-testable drop zone.
        // border-box so px pins match the measured border-box exactly.
        dropEl.style.boxSizing = "border-box";
        dropEl.style.height = `${rect.height}px`;
        dropEl.style.width = `${rect.width}px`;
        dropEl.style.flexShrink = "0";
        els.forEach((el, i) => {
          const r = rects[i];
          el.__ccsSavedStyle = saveStyle(el);
          el.style.position = "absolute";
          el.style.left = `${r.left - rect.left}px`;
          el.style.top = `${r.top - rect.top}px`;
          el.style.boxSizing = "border-box";
          el.style.width = `${r.width}px`;
          el.style.height = `${r.height}px`;
          el.style.margin = "0";
          // The drag source becomes the fixed ghost — keep it above siblings.
          // .ccs-drag-src exempts it from the frozen transform-strip so its
          // translate still follows the pointer.
          el.classList.toggle("ccs-drag-src", el === dragEl);
          el.style.zIndex = el === dragEl ? "5000" : "1";
        });
      }
    };
    const unfreezeAll = () => {
      for (const dropEl of document.querySelectorAll(`.${FROZEN}`)) {
        dropEl.__ccsFrozen = false;
        dropEl.classList.remove(FROZEN);
        if (dropEl.__ccsSavedStyle) Object.assign(dropEl.style, dropEl.__ccsSavedStyle);
        for (const el of dropEl.querySelectorAll("[data-rfd-draggable-id]")) {
          el.classList.remove("ccs-drag-src");
          if (el.__ccsSavedStyle) { Object.assign(el.style, el.__ccsSavedStyle); el.__ccsSavedStyle = null; }
        }
        for (const a of dropEl.__ccsAnchors || []) {
          if (a.__ccsSavedStyle) Object.assign(a.style, a.__ccsSavedStyle);
          a.__ccsSavedStyle = null;
          a.__ccsPinned = false;
        }
        dropEl.__ccsAnchors = null;
      }
    };
    let pressedEl = null;
    let armed = false;
    let holdTimer = null;
    let hoverTimer = null;
    let hoverEl = null;
    let hoverId = "";
    const HOLD_MS = 1000;       // press-and-hold charge-up before the drag arms
    const HOVER_OPEN_MS = 420;  // linger on a folder pill before it opens

    const clearHover = () => {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      if (hoverEl) { hoverEl.classList.remove("ccs-drop-hover"); hoverEl = null; }
      hoverId = "";
    };
    const resetDragUI = () => {
      clearHover();
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      armed = false;
      if (pressedEl) pressedEl.classList.remove("ccs-nav-holding");
      document.documentElement.classList.remove("ccs-grab-cursor");
      pressedEl = null;
      hideLiteGap();
    };
    // First draggable under the point, skipping the pointer-following ghost.
    const dragTargetAt = (x, y) => {
      for (const el of document.querySelectorAll("[data-rfd-draggable-id]")) {
        if (el === pressedEl) continue;
        const r = el.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        return el;
      }
      return null;
    };

    const onPointerDown = (event) => {
      if (event.button === 2) return; // right-click opens context menus, not drags
      window.__ccsNavDropFolder = "";
      window.__ccsNavDropPage = "";
      pressedEl = event.target.closest?.("[data-rfd-draggable-id]") || null;
      if (!pressedEl) return;
      const scope = pressedEl.closest("[data-top-navigation-links], .side-nav, [role='menu']");
      if (scope) freezeAll(scope, pressedEl);
      // Hold-to-drag ritual: HOLD_MS of still-pressing charges up the pill
      // (.ccs-nav-holding cue), then the drag arms and the cursor becomes the
      // grab hand. Moves before arming are swallowed so the library can't
      // lift early.
      pressedEl.classList.add("ccs-nav-holding");
      holdTimer = setTimeout(() => {
        holdTimer = null;
        armed = true;
        pressedEl?.classList.remove("ccs-nav-holding");
        document.documentElement.classList.add("ccs-grab-cursor");
      }, HOLD_MS);
    };

    // Lite flyout gap preview: pointer inside an auto-opened folder list
    // shifts the items below the insertion point down, opening a visible gap
    // — same "make room" language as the bar's displaced pills.
    const hideLiteGap = () => {
      for (const el of document.querySelectorAll("[data-ccs-fld-item]")) {
        el.style.transform = "";
        el.__ccsOrigCenter = null;
      }
      for (const m of document.querySelectorAll("[data-ccs-folder-list]")) {
        m.__ccsGapIdx = null;
        m.classList.remove("ccs-drop-hover");
      }
    };
    const showLiteGap = (menuEl, y) => {
      const items = Array.from(menuEl.querySelectorAll("[data-ccs-fld-item]"));
      const itemH = items[0]?.offsetHeight || 38;
      const idx = items.filter((el) => {
        if (el.__ccsOrigCenter == null) {
          const r = el.getBoundingClientRect();
          // Rect may already be displaced by our own shift — subtract it back.
          el.__ccsOrigCenter = r.top + r.height / 2 - (el.__ccsShifted ? itemH : 0);
        }
        return el.__ccsOrigCenter < y;
      }).length;
      menuEl.__ccsGapIdx = idx;
      menuEl.classList.add("ccs-drop-hover");
      items.forEach((el, i) => {
        const on = i >= idx;
        if (on !== !!el.__ccsShifted) {
          el.__ccsShifted = on;
          el.style.transform = on ? `translateY(${itemH}px)` : "";
        }
      });
    };

    const onPointerMove = (event) => {
      if (!pressedEl) return;
      if (!armed) { event.stopImmediatePropagation(); return; }
      // Armed: hover bookkeeping — highlight the folder pill under the
      // pointer; lingering opens top-bar flyouts so the page can be placed
      // inside. Over an open menu = inside the folder, no pill hover.
      const liteMenu = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-ccs-folder-list]");
      const srcId0 = pressedEl.getAttribute("data-rfd-draggable-id") || "";
      if (liteMenu && !(isFolderToken(srcId0) || srcId0.startsWith("sfolder:"))) {
        clearHover();
        showLiteGap(liteMenu, event.clientY);
        return;
      }
      hideLiteGap();
      if (event.target.closest?.("[role='menu']")) { clearHover(); return; }
      const srcId = pressedEl.getAttribute("data-rfd-draggable-id") || "";
      const srcIsFolder = isFolderToken(srcId) || srcId.startsWith("sfolder:");
      const hit = dragTargetAt(event.clientX, event.clientY);
      const hitId = hit?.getAttribute("data-rfd-draggable-id") || "";
      if (!srcIsFolder && hit && (isFolderToken(hitId) || hitId.startsWith("sfolder:"))) {
        if (hitId !== hoverId) {
          clearHover();
          hoverId = hitId;
          hoverEl = hit;
          hit.classList.add("ccs-drop-hover");
          if (isFolderToken(hitId)) {
            const fid = tokenFolderId(hitId);
            hoverTimer = setTimeout(() => {
              hoverTimer = null;
              window.dispatchEvent(new CustomEvent("ccs-nav-open-folder", { detail: { folderId: fid } }));
            }, HOVER_OPEN_MS);
          }
        }
      } else clearHover();
    };
    // Pre-arm swallow for the legacy mouse-event path (the library may listen
    // mousemove instead of pointermove depending on sensor).
    const onMouseMove = (event) => {
      if (pressedEl && !armed) event.stopImmediatePropagation();
    };
    // On release during a nav drag, hit-test the pointer against the folder
    // pills' painted boxes BEFORE unfreezing (unfreeze restores pre-drag
    // rects). handleNavReorder reads __ccsNavDropFolder so the pill the
    // pointer is visually over wins — not whichever displaced model box the
    // library's combine math picked.
    const onPointerUp = (event) => {
      window.__ccsNavDropFolder = "";
      window.__ccsNavDropPage = "";
      window.__ccsNavDropAfter = false;
      window.__ccsNavDropIndex = -1;
      if (window.__ccsNavDragging) {
        // Release inside an auto-opened (lite) folder list: the gap index the
        // preview showed is the slot the page lands in.
        const liteMenu = document.elementFromPoint(event.clientX, event.clientY)
          ?.closest?.("[data-ccs-folder-list]");
        if (liteMenu) {
          window.__ccsNavDropFolder = liteMenu.getAttribute("data-ccs-folder-list") || "";
          window.__ccsNavDropIndex = Number.isInteger(liteMenu.__ccsGapIdx) ? liteMenu.__ccsGapIdx : 0;
        }
        let page = "";
        let pageRect = null;
        for (const el of liteMenu ? [] : document.querySelectorAll("[data-rfd-draggable-id]")) {
          // The drag ghost always contains the release point — skip it or it
          // shadows the real target (self-combine no-ops the drop).
          if (el === pressedEl) continue;
          const id = el.getAttribute("data-rfd-draggable-id");
          const r = el.getBoundingClientRect();
          if (event.clientX < r.left || event.clientX > r.right ||
              event.clientY < r.top || event.clientY > r.bottom) continue;
          if (isFolderToken(id) || id?.startsWith("sfolder:")) {
            window.__ccsNavDropFolder = isFolderToken(id)
              ? tokenFolderId(id) : id.slice("sfolder:".length);
            break;
          }
          if (!page && (id?.startsWith("top-") || id?.startsWith("side-"))) { page = id; pageRect = r; }
        }
        window.__ccsNavDropPage = page;
        // Release in the target's right/bottom half = insert AFTER it — the
        // displaced gap preview the user aimed at decides the slot.
        if (pageRect) window.__ccsNavDropAfter = event.clientX > pageRect.left + pageRect.width / 2;
      }
      resetDragUI();
      unfreezeAll();
    };
    const onKeyDown = (event) => { if (event.key === "Escape") { resetDragUI(); unfreezeAll(); } };
    const onCancel = () => { resetDragUI(); unfreezeAll(); };
    // pointerup on window+capture: registered at mount, so it runs before the
    // drag library's own window-level release handler and before onDragEnd.
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onCancel);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onCancel);
      resetDragUI();
      unfreezeAll();
    };
  }, []);

  // Server-side order sync (other devices / settings reset) re-reads the
  // bridged localStorage copy and repaints the bars.
  useEffect(() => {
    const sync = () => setNavOrder(loadNavOrder(currentUser?.email));
    window.addEventListener("ccs-nav-order-sync", sync);
    return () => window.removeEventListener("ccs-nav-order-sync", sync);
  }, [currentUser?.email]);

  // Personal landing page: only intercepts the bare root route.
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
    window.dispatchEvent(new Event("ccs-nav-drag-end"));
    const state = navState();

    // WYSIWYG folder drop: the pointerup handler recorded which folder pill
    // (if any) the pointer was visually over while rects still reflected the
    // painted positions — that intent beats the library's displaced-model
    // combine math. Folder drags can't nest (their url resolves null and
    // falls through to the reorder path).
    const dropFolder = window.__ccsNavDropFolder;
    window.__ccsNavDropFolder = "";
    if (dropFolder) {
      window.__ccsNavDropPage = "";
      const url = pageUrlFromDraggable(draggableId);
      if (url) {
        const idx = window.__ccsNavDropIndex;
        window.__ccsNavDropIndex = -1;
        const next = movePageToFolder(state, url, dropFolder,
          Number.isInteger(idx) && idx >= 0 ? idx : undefined);
        persistNavState(mergeHiddenTail(next.order), next.folders);
        return;
      }
    }

    // WYSIWYG page drop: the pill the pointer was over won above; a page the
    // pointer was over is the insert target — same semantics as a page combine
    // ("drop at that position"). Falls back to the library's combine/dest.
    const dropPage = window.__ccsNavDropPage;
    window.__ccsNavDropPage = "";
    const effCombine = dropPage ? { draggableId: dropPage } : combine;

    // Combine drop: a page released on a folder pill/group header joins that
    // folder (bar droppables run isCombineEnabled). Non-folder combines are
    // page-on-page — treated as "insert at that target's position".
    if (effCombine) {
      const target = String(effCombine.draggableId || "");
      const folderId = isFolderToken(target) ? tokenFolderId(target)
        : target.startsWith("sfolder:") ? target.slice("sfolder:".length) : null;
      const url = pageUrlFromDraggable(draggableId);
      if (!url) return;
      if (folderId) {
        // Pointer-measured slot inside an auto-opened (lite) list wins over a
        // plain append — the visible gap the user aimed at is the contract.
        const idx = window.__ccsNavDropIndex;
        window.__ccsNavDropIndex = -1;
        const next = movePageToFolder(state, url, folderId,
          Number.isInteger(idx) && idx >= 0 ? idx : undefined);
        persistNavState(mergeHiddenTail(next.order), next.folders);
        return;
      }
      // Combine onto a page button = "drop at that position" — pull the page
      // out of any folder and slot it where the target sits on the bar.
      const targetUrl = pageUrlFromDraggable(target);
      if (!targetUrl || targetUrl === url) return;
      const { order, folders } = removeUrlEverywhere(state.order, state.folders, url);
      const entries = resolveTopLevel(order, folders, barPageUrls);
      const at = entries.findIndex((e) => e.type === "page" && e.url === targetUrl);
      // Pointer released in the target's right half lands after it — matches
      // the shift-to-make-room gap the user actually aimed at.
      const insertAt = (at < 0 ? entries.length : at) + (window.__ccsNavDropAfter ? 1 : 0);
      window.__ccsNavDropAfter = false;
      entries.splice(insertAt, 0, { type: "page", url });
      persistNavState(mergeHiddenTail(entriesToOrder(entries)), folders);
      return;
    }
    if (!destination) return;
    const destId = destination.droppableId;
    const srcId = source.droppableId;

    // Folder pill drag — only a top-level reorder is legal (no folder nesting).
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

    // Drop into an open folder list → insert at index (also within-folder reorder).
    const listDest = destId.startsWith("folder-list:")
      ? destId.slice(destId.indexOf(":") + 1) : null;
    if (listDest) {
      const folder = effectiveFolders.find((f) => f.id === listDest);
      if (!folder) return;
      if (srcId === destId && source.index === destination.index) return;
      const next = movePageToFolder(state, url, listDest, destination.index);
      persistNavState(mergeHiddenTail(next.order), next.folders);
      return;
    }

    // Drop on the bar (top or side) → reorder, or move a folder page back out.
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
  // Intentionally no onDragUpdate handler — updating state mid-drag re-renders
  // the DnD tree and can abort the drag. Combine targets and open folder
  // lists give all the feedback needed.

  // Hidden pages keep their tail slot in the saved order.
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
    if (Object.keys(value).length) next[url] = value; else delete next[url];
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
  
  // Detect mobile + narrow-desktop widths (top bar auto-compacts below 1400px)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isNarrowShell, setIsNarrowShell] = useState(() => window.innerWidth < 1400);
  const [isShortShell, setIsShortShell] = useState(() => window.innerHeight < 720);
  useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth < 768);
      setIsNarrowShell(window.innerWidth < 1400);
      setIsShortShell(window.innerHeight < 720);
    };
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
  const topBarCompact = compactView || isNarrowShell;
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

        /* While a nav drag is frozen (absolute-pinned), the library's
           flow-position placeholder would render at the container origin —
           hide it; combine + folder-list targets give the feedback. */
        .ccs-nav-frozen [data-rfd-placeholder-context-id] {
          display: none !important;
        }


        /* Press-and-hold charge-up: a 1s fill cue on the pressed pill before
           the drag arms — communicates "keep holding to grab". */
        .ccs-nav-holding {
          animation: ccsNavHoldCharge 1s cubic-bezier(0.2, 0.7, 0.3, 1) forwards !important;
        }
        @keyframes ccsNavHoldCharge {
          0%   { box-shadow: inset 0 0 0 2px rgba(139,92,246,0), 0 0 0 0 rgba(139,92,246,0); transform: scale(1); }
          55%  { box-shadow: inset 0 0 0 2px rgba(139,92,246,.75), 0 0 10px 1px rgba(139,92,246,.30); transform: scale(1.035); }
          100% { box-shadow: inset 0 0 0 2px rgba(139,92,246,.95), 0 0 16px 3px rgba(139,92,246,.45); transform: scale(1.06); }
        }

        /* Folder pill currently hovered by an armed drag — ring + glow shows
           it will receive the page (and will open after a short linger). */
        .ccs-drop-hover {
          outline: 2px solid rgba(139,92,246,.95) !important;
          outline-offset: 2px;
          box-shadow: 0 0 0 5px rgba(139,92,246,.28), 0 0 20px rgba(139,92,246,.5) !important;
        }

        /* While a nav drag is armed: the whole window gets the grab-hand
           cursor (gloved fist asset) with native grabbing as fallback. */
        html.ccs-grab-cursor,
        html.ccs-grab-cursor * {
          cursor: url("data:image/svg+xml,%3Csvg%20width%3D%2232%22%20height%3D%2232%22%20id%3D%22emoji%22%20viewBox%3D%220%200%2072%2072%22%20version%3D%221.1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20id%3D%22color%22%3E%3Cline%20x1%3D%2251%22%20x2%3D%2251%22%20y1%3D%2247.42%22%20y2%3D%2233.14%22%20fill%3D%22none%22%2F%3E%3C%2Fg%3E%3Cg%20id%3D%22skin%22%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m42.03%2047.56c-0.3312%202.471-2.599%207.032-5.057%206.7-0.293-0.03821-0.6495-0.1401-1.045-0.293%200.8407-3.095%205.477-7.923%206.114-9.579l-0.01274%201.987c0.05095%200.3949%200.05095%200.8025%200%201.185z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m33.19%2024.09-0.01274%201.223h0.01274c0.05095-0.4204%200.05095-0.828%200-1.223zm8.917-1.146v1.172c0.05095-0.3949%200.05095-0.8025%200-1.172z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m56.86%2028.69c-0.2038-0.1529-1.745-0.3482-1.745-0.3482l-3.264-0.01274c-0.5987-0.2802-0.8247-1.55-0.8247-4.288%200.3312-2.471-1.401-4.726-3.86-5.057-8.881%202.622-2.133%201.723-8.917%200.08917-9.376%202.498-1.771%202.843-8.917%201.185-9.755%200.1624-1.828%206.409-9.006%201.274-2.458-0.3312-4.726%201.401-5.044%203.86-0.06369%200.3949-0.06369%200.8025%200%201.197h-0.03821l0.03821%2010.97c-0.3312%202.458%201.401%204.726%203.86%205.057%206.352-0.265%205.107-9.398%205.057%201.223-0.3312%202.458%201.401%204.726%203.86%205.057%204.281-2.589%204.384%206.516%207.599%208.173%200.8025%202.051%2010.28-0.168%2011.56-0.1043%204.928%202.479%2012.18-2.03%2010.32-4.553%200.05095-0.3949%200.05095-8.165%200-8.56%200.1783-2.076%201.185-13.71-0.6751-15.16z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m32.48%2046.77c-0.293%200.5095-0.7006%200.9426-1.172%201.287%200.2165-0.4331%200.5987-0.8789%201.172-1.287z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m33.13%2041.53c0.03821%200.8789%200.02548%202.879-0.01274%203.401z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m32.48%2046.77c-0.293%200.5095-0.7006%200.9426-1.172%201.287%200.2165-0.4331%200.5987-0.8789%201.172-1.287z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m33.12%2044.93%200.01274-3.401c0.03821%200.8789%200.02548%202.879-0.01274%203.401z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m33.19%2025.31h-0.01274l0.01274-1.223c0.05095%200.3949%200.05095%200.8025%200%201.223z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m42.11%2024.11v-1.172c0.05095%200.3694%200.05095%200.777%200%201.172z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m39.17%2056.81c-2.577%200-9.977%204.548-8.467-7.881z%22%2F%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22m57.31%2033.52c0-1.9%200-4.118-2.011-4.118z%22%2F%3E%3C%2Fg%3E%3Cg%20id%3D%22line%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22m41.94%2037.24v7.074c-0.3346%202.512%201.428%204.82%203.936%205.156%202.509%200.3352%204.813-1.43%205.148-3.942%200.0536-0.4028%200.0536-0.8107%200-1.213l-5.19e-4%20-20.48c0.3346-2.512-1.428-4.82-3.936-5.156s-4.813%201.43-5.148%203.942v1.301c0.3346-2.512-1.428-4.82-3.936-5.156s-4.813%201.43-5.148%203.942v2.427c0.3346-2.512-1.428-4.82-3.936-5.156s-4.813%201.43-5.148%203.942c-0.02619%200.8746-0.02488%201.613-0.08098%202.513%200.3346-2.512-1.428-4.82-3.936-5.156s-4.813%201.43-5.148%203.942c-0.0536%200.4028-0.0536%200.8107-0.02011%201.214l0.02064%2011.19c-0.3346%202.512%201.428%204.82%203.936%205.156%202.509%200.3352%204.813-1.43%205.148-3.942%200.0536-0.4028%200.0536-0.8107%200-1.213v-1.341l0.04022-3.517-0.04023%2011.27c-0.3346%202.512%201.428%204.82%203.936%205.156s4.813-1.43%205.148-3.942c0.0536-0.4028%200.0536-3.548%200-3.951v-5.012l-0.04075-4.248%200.04075%2014.6c-0.3346%202.512%201.428%204.82%203.936%205.156s4.813-1.43%205.148-3.942c0.0536-0.4028%200.0536-0.8107%200-1.213l0.08046-15.82z%22%2F%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22m57.43%2052.08c-0.2117%202.896-2.598%205.149-5.497%205.19h-12.98%22%2F%3E%3Cline%20x1%3D%2257.43%22%20x2%3D%2257.43%22%20y1%3D%2252.08%22%20y2%3D%2233.52%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-miterlimit%3D%2210%22%20stroke-width%3D%222%22%20d%3D%22m38.95%2057.27c-2.625%200-7.445%200.6149-7.445-3.105%22%2F%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-miterlimit%3D%2210%22%20stroke-width%3D%222%22%20d%3D%22m57.43%2033.52c0-1.938%200-4.201-2.049-4.201%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E") 16 16, grabbing !important;
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
                animate={{ x: isHovered ? sideNavWidth - 1 : 0, opacity: 1 }}
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
                animate={{ y: isHovered ? topNavHeight - 1 : 0, opacity: 1 }}
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
                  <button type="button"
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
                  <button type="button"
                    data-login-gate-allow
                    onClick={showLoginDialog}
                    className={`ccs-glass-control ccs-glass-purple w-full flex items-center justify-center rounded-xl text-violet-200 ${compactView ? "h-7 gap-1 text-xs" : "h-9 gap-2 text-sm"}`}
                    title="Sign In"
                  >
                    <LogIn className="h-4 w-4 text-violet-300" />
                    <span className="font-bold text-sm text-violet-100">Sign In</span>
                  </button>
                ) : (
                  <button type="button"
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

                {currentUser && (
                  <div className="mt-2 flex w-full min-w-0 justify-center overflow-hidden">
                    <TimeTracker position="side" hasSideBar hasTopBar={!isSideNav} />
                  </div>
                )}

                {/* Announcement button - admin only, above Time Clock */}
                {isUserAdmin(currentUser) && (
                  <button type="button"
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

                  <button type="button"
                    onClick={() => setShowAddTaskDialog(true)}
                    className={`ccs-glass-control ccs-glass-blue flex flex-1 items-center justify-center rounded-xl text-blue-200 ${compactView ? "h-7 gap-1 px-1.5 text-[11px]" : "gap-2 px-3 py-2 text-sm"}`}
                  >
                    <ClipboardList className="w-4 h-4 text-blue-600" />
                    <span className={`${compactView ? "text-[11px]" : "text-sm"} font-bold`}>+ Task</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <GlobalSearch className="w-full justify-center" compact={compactView} shellGlass />
                  <AttentionBell compact={compactView} shellGlass />
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <div
              className={`flex-1 overflow-y-auto ${compactView ? "px-1.5 py-1" : "px-3 py-2"}`}
              onContextMenu={handleBarContextMenu}
            >
              <DragDropContext onDragEnd={handleNavReorder} onDragStart={handleNavDragStart}>
                <Droppable droppableId="page-nav-side" direction="vertical" isCombineEnabled>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={compactView ? "space-y-0.5" : "space-y-1"}
                    >
                      {topEntries.map((entry, index) => {
                        const dndId = entry.type === "folder" ? `sfolder:${entry.id}` : `side-${entry.url}`;
                        if (entry.type === "folder") {
                          const folder = entry.folder;
                          return (
                            <Fragment key={dndId}>
                              <Draggable draggableId={dndId} index={index}>
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                  >
                                    <SidebarNavGroup
                                      label={folder.name}
                                      items={folderItems(folder)}
                                      collapsed={!!collapsedGroups[folder.id] || isShortShell}
                                      onToggle={() => toggleNavGroup(folder.id)}
                                      compactView={compactView}
                                      activePath={location.pathname}
                                      isInSplitUrl={isInSplitView}
                                      onNavigate={handleNavClick}
                                      accent={folder.color}
                                      stylePreset={folder.style}
                                      onContextMenuGroup={({ x, y }) =>
                                        setNavMenu({ x, y, kind: "folder", folderId: folder.id })}
                                      onContextMenuItem={(item, { x, y }) =>
                                        setNavMenu({ x, y, kind: "page", url: item.url })}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            </Fragment>
                          );
                        }
                        const item = barItemByUrl.get(entry.url);
                        if (!item) return null;
                        return (
                          <Fragment key={dndId}>
                            <Draggable draggableId={dndId} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <NavPageLink
                                  item={item}
                                  variant="side"
                                  compactView={compactView}
                                  isActive={location.pathname === item.url}
                                  isInSplit={isInSplitView(item)}
                                  onNavigate={(event) => handleNavClick(event, item)}
                                  onContextMenuItem={(itm, { x, y }) =>
                                    setNavMenu({ x, y, kind: "page", url: itm.url })}
                                  dragRef={dragProvided.innerRef}
                                  dragProps={dragProvided.draggableProps}
                                  dragSnapshot={dragSnapshot}
                                  dragHandleProps={dragProvided.dragHandleProps}
                                />
                              )}
                            </Draggable>
                          </Fragment>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
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
            <div className={topBarCompact ? "px-2 py-1" : "px-4 py-2"}>
              <div className="ccs-topbar-layout" data-compact={compactView}>
                {/* Brand + tiny shell view controls */}
                <div className="ccs-topbar-brand">
                  <div className={`ccs-glass-panel flex items-center ${topBarCompact ? "gap-1.5 rounded-xl px-1.5 py-1" : "gap-2 rounded-2xl px-3 py-2 sm:gap-3 sm:px-4"}`}>
                    <button type="button"
                      onClick={() => setNavLayout(navLayout === "top" ? "side" : "top")}
                      className={`ccs-glass-control ccs-glass-purple flex items-center justify-center text-violet-200 ${topBarCompact ? "h-6 w-6 rounded-lg" : "h-8 w-8 rounded-xl sm:h-10 sm:w-10 sm:rounded-2xl"}`}
                      title="Switch to Sidebar"
                    >
                      <PanelLeft className={topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4 sm:h-5 sm:w-5"} />
                    </button>
                    <div className="hidden sm:block">
                      <h2 className={`${topBarCompact ? "text-xs" : "text-lg"} font-bold leading-tight text-white`}>Sign Shop</h2>
                      {!topBarCompact && <p className="text-xs text-slate-300">Workflow Manager</p>}
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
                <button type="button"
                  className="ccs-topbar-menu lg:hidden clay-button p-2 min-h-[40px] min-w-[40px]"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-expanded={mobileMenuOpen}
                  aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                  title={mobileMenuOpen ? "Close menu" : "Open menu"}
                >
                  {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>

                {/* Keep utilities available at tablet widths as well as desktop. */}
                <div className={`ccs-topbar-utilities hidden md:flex flex-wrap items-center ${topBarCompact ? "gap-1" : "gap-2"}`}>
                  <div className={`flex flex-wrap items-stretch ${topBarCompact ? "gap-1" : "gap-2"}`}>
                    {/* Login / Logout button */}
                    {!currentUser ? (
                      <button type="button"
                        data-login-gate-allow
                        onClick={showLoginDialog}
                        className={`ccs-glass-control ccs-glass-purple flex items-center rounded-xl text-violet-200 ${topBarCompact ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`}
                        title="Sign In"
                      >
                        <LogIn className={topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                        <span className={`${topBarCompact ? "text-[11px]" : "text-sm"} font-bold`}>Sign In</span>
                      </button>
                    ) : (
                      <button type="button"
                        data-login-gate-allow
                        onClick={logout}
                        className={`ccs-glass-control ccs-glass-neutral flex items-center rounded-xl text-slate-100 ${topBarCompact ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`}
                        title={`Logout ${getUserFirstName()}`}
                      >
                        <LogOut className={topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                        <span className={`${topBarCompact ? "text-[11px]" : "text-sm"} font-bold`}>Logout</span>
                      </button>
                    )}

                    {currentUser && <FocusPausePair currentUser={currentUser} compact={topBarCompact} />}
                    {currentUser && <TimeTracker position="top" hasTopBar hasSideBar={isSideNav || isMobile} />}

                    {/* Announcement button - admin only */}
                    {isUserAdmin(currentUser) && (
                      <button type="button"
                        onClick={() => setShowAnnouncementManager(true)}
                        className={`ccs-glass-control ccs-glass-red flex flex-shrink-0 items-center justify-center rounded-xl text-red-200 ${topBarCompact ? "h-7 w-8" : "w-11 self-stretch"}`}
                        title="Announcements (Admin)"
                      >
                        <Megaphone className={topBarCompact ? "h-3.5 w-3.5" : "h-5 w-5"} />
                      </button>
                    )}
                    <Link
                      to={createPageUrl("TimeClock")}
                      className={`ccs-glass-control ccs-glass-green flex items-center rounded-xl text-emerald-200 ${topBarCompact ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`}
                    >
                      <Home className={topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                      <span className={`${topBarCompact ? "text-[11px]" : "text-sm"} font-bold`}>Time Clock</span>
                    </Link>

                    <button type="button"
                      onClick={() => setShowAddTaskDialog(true)}
                      className={`ccs-glass-control ccs-glass-blue flex items-center rounded-xl text-blue-200 ${topBarCompact ? "h-7 gap-1 px-2 text-[11px]" : "gap-2 px-3 py-1.5 text-sm"}`}
                    >
                      <ClipboardList className={topBarCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                      <span className={`${topBarCompact ? "text-[11px]" : "text-sm"} font-bold`}>+ Task</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <GlobalSearch className={topBarCompact ? "w-[116px] justify-center" : "w-56 justify-center"} compact={topBarCompact} shellGlass />
                    <AttentionBell compact={topBarCompact} shellGlass />
                  </div>
                </div>

                {/* Links use the space between the brand and utilities when available. */}
                <div
                  data-top-navigation-links
                  data-manual-compact={compactView}
                  onContextMenu={handleBarContextMenu}
                  className={`ccs-topbar-links hidden lg:flex flex-wrap items-center ${topBarCompact ? "gap-0.5" : "gap-1"}`}
                >
                  <DragDropContext onDragEnd={handleNavReorder} onDragStart={handleNavDragStart}>
                    <Droppable droppableId="page-nav-top" direction="horizontal" isCombineEnabled>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex flex-wrap items-center ${topBarCompact ? "gap-0.5" : "gap-1"}`}
                        >
                          {topEntries.map((entry, index) => {
                            const dndId = entry.type === "folder" ? folderToken(entry.id) : `top-${entry.url}`;
                            if (entry.type === "folder") {
                              const folder = entry.folder;
                              const FolderIcon = folderIconFor(folder.icon);
                              return (
                                <Fragment key={dndId}>
                                  <Draggable draggableId={dndId} index={index}>
                                    {(dragProvided, dragSnapshot) => (
                                      <div
                                        ref={dragProvided.innerRef}
                                        {...dragProvided.draggableProps}
                                        {...dragProvided.dragHandleProps}
                                        className="rounded-lg"
                                      >
                                        <NavFlyoutMenu
                                          label={folder.name}
                                          icon={FolderIcon}
                                          accent={folder.color}
                                          stylePreset={folder.style}
                                          folderId={folder.id}
                                          items={folderItems(folder)}
                                          compactView={compactView}
                                          activePath={location.pathname}
                                          isInSplitUrl={isInSplitView}
                                          onNavigate={handleNavClick}
                                          onContextMenuPill={({ x, y }) =>
                                            setNavMenu({ x, y, kind: "folder", folderId: folder.id })}
                                          onContextMenuItem={(item, { x, y }) =>
                                            setNavMenu({ x, y, kind: "page", url: item.url })}
                                        />
                                      </div>
                                    )}
                                  </Draggable>
                                </Fragment>
                              );
                            }
                            const item = barItemByUrl.get(entry.url);
                            if (!item) return null;
                            return (
                              <Fragment key={dndId}>
                                <Draggable draggableId={dndId} index={index}>
                                  {(dragProvided, dragSnapshot) => (
                                    <NavPageLink
                                      item={item}
                                      variant="top"
                                      compactView={compactView}
                                      isActive={location.pathname === item.url}
                                      isInSplit={isInSplitView(item)}
                                      onNavigate={(event) => handleNavClick(event, item)}
                                      onContextMenuItem={(itm, { x, y }) =>
                                        setNavMenu({ x, y, kind: "page", url: itm.url })}
                                      dragRef={dragProvided.innerRef}
                                      dragProps={dragProvided.draggableProps}
                                      dragSnapshot={dragSnapshot}
                                      dragHandleProps={dragProvided.dragHandleProps}
                                    />
                                  )}
                                </Draggable>
                              </Fragment>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>
              </div>

              {/* Mobile Navigation Menu */}
              {mobileMenuOpen && (
                <div className="lg:hidden mt-2 border-t border-gray-200 pt-2">
                  <div className="ccs-topbar-menu-grid grid grid-cols-3 gap-1">
                    {[...ALL_NAV_PAGES.keys()].map((u) => styledPage(u)).filter((item) => item && !navHidden.includes(item.url)).map((item) => {
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
                          className={`ccs-glass-nav-item flex min-h-[36px] min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 ${isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""}`}
                          style={{ "--glass-accent-rgb": hexToRgbTuple(item.accent) }}
                          title="Ctrl+Click to open in split view"
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0" style={{ color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }} />
                          <span className={`text-base font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`}>
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
            <button type="button"
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
              orientation={orientation}
              onToggleOrientation={toggleOrientation}
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
                    <LoginGate exempt={location.pathname.replace(/\/+$/, "").toLowerCase() === "/timeclock"}>{children}</LoginGate>
                  </motion.div>
                </AnimatePresence>
              ) : (
                <motion.div
                  key={location.pathname}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  style={{ minHeight: "100%" }}
                >
                  <LoginGate exempt={location.pathname.replace(/\/+$/, "").toLowerCase() === "/timeclock"}>{children}</LoginGate>
                </motion.div>
              )}
            </MultiPageContainer>
          </MultiPageContext.Provider>
        </motion.main>

        <SyncConflictAlert currentUser={currentUser} sessionToken={sessionToken}/>
        {/* Smartsheet Sync Status Widget — persistent on every page */}
        <SmartsheetSyncWidget
          compactOrderForm={location.pathname.replace(/\/+$/, '').toLowerCase() === '/orderform'}
          sessionToken={sessionToken}
          currentUser={currentUser}
        />

        {/* Add Task Dialog */}
        <AddTaskDialog
          isOpen={showAddTaskDialog}
          onClose={() => setShowAddTaskDialog(false)}
        />

        {/* Nav customization: right-click menus + folder/page editors */}
        {navMenu && (
          <NavContextMenu
            x={navMenu.x}
            y={navMenu.y}
            onClose={() => setNavMenu(null)}
            items={
              navMenu.kind === "bar"
                ? [{ icon: FolderPlus, label: "New folder", onClick: () => openFolderEditor(null, true) }]
                : navMenu.kind === "folder"
                  ? [
                      { icon: PencilLine, label: "Edit folder", onClick: () => openFolderEditor(navMenu.folderId) },
                      { icon: Trash2, label: "Delete folder", danger: true, onClick: () => handleDeleteFolder(navMenu.folderId) },
                    ]
                  : [
                      { icon: PencilLine, label: "Edit button", onClick: () => openPageEditor(navMenu.url) },
                    ]
            }
          />
        )}
        {navEditor && navEditor.mode === "folder" && (() => {
          const folder = navEditor.isNew ? null : effectiveFolders.find((f) => f.id === navEditor.folderId);
          return (
            <NavItemEditor
              mode="folder"
              title={navEditor.isNew ? "New folder" : `Edit folder`}
              name={folder?.name || "New Folder"}
              color={folder?.color || "#8B5CF6"}
              style={folder?.style || "glass"}
              icon={folder?.icon || "Folder"}
              allowDelete={!navEditor.isNew}
              onSave={(patch) => handleSaveFolder(navEditor.folderId, navEditor.isNew, patch)}
              onDelete={() => handleDeleteFolder(navEditor.folderId)}
              onClose={() => setNavEditor(null)}
            />
          );
        })()}
        {navEditor && navEditor.mode === "page" && (() => {
          const base = ALL_NAV_PAGES.get(navEditor.url);
          if (!base) return null;
          const override = pageStyles[navEditor.url] || {};
          return (
            <NavItemEditor
              mode="page"
              title={`Edit “${base.title}” button`}
              name={override.name || base.title}
              color={override.color || base.accent}
              style={override.style || "glass"}
              allowReset={Boolean(pageStyles[navEditor.url])}
              onSave={(patch) => handleSavePage(navEditor.url, patch)}
              onReset={() => handleResetPage(navEditor.url)}
              onClose={() => setNavEditor(null)}
            />
          );
        })()}

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
            <button type="button"
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
              <button type="button"
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
                        <button type="button"
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
              <button type="button"
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
                className="ccs-glass-shell fixed inset-0 z-40"
                style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}
              >
                <div className="h-full overflow-y-auto p-4 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white">All Pages</h2>
                    <button type="button" onClick={() => setMobileMenuOpen(false)} className="ccs-glass-control ccs-glass-neutral rounded-lg p-2 text-slate-100">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  {currentUser && (
                    <div className="mb-3 space-y-2">
                      <FocusPausePair currentUser={currentUser} fullWidth compact />
                      <div className="flex w-full min-w-0 justify-center overflow-hidden">
                        <TimeTracker position="side" hasSideBar hasTopBar={!isSideNav} />
                      </div>
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
                    {[...ALL_NAV_PAGES.keys()].map((u) => styledPage(u)).filter((item) => item && !navHidden.includes(item.url)).map((item) => {
                      const isActive = location.pathname === item.url;
                      return (
                        <Link
                          key={item.title}
                          to={item.url}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`ccs-glass-nav-item flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 ${isActive ? "font-bold" : ""}`}
                          style={{ "--glass-accent-rgb": hexToRgbTuple(item.accent) }}
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0" style={{ color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }} />
                          <span className={`text-base font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`}>
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
      <TimeClockStatusProvider>
        <ResearchProgressProvider>
          <MultiImportProvider>
            <AnnouncementProvider currentPageName={currentPageName}>
              <LayoutContent>{protectedChildren}</LayoutContent>
              <ResearchProgressBar />
            </AnnouncementProvider>
          </MultiImportProvider>
        </ResearchProgressProvider>
      </TimeClockStatusProvider>
    </ImportProgressProvider>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <AuthProvider>
      <WorkspacePreferencesProvider>
        <LayoutContentWrapper currentPageName={currentPageName}>{children}</LayoutContentWrapper>
      </WorkspacePreferencesProvider>
    </AuthProvider>
  );
}