// .audit-work/foundation-phaseb3/candidate-tree-src/react-stub.js
var useState = (v) => [v, () => {
}];
var useRef = (v) => ({ current: v });
var useEffect = () => {
};
var Fragment = Symbol("Fragment");

// .audit-work/foundation-phaseb3/verify/stubs/three.js
var Vector3 = class _Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  clone() {
    return new _Vector3(this.x, this.y, this.z);
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l;
    this.y /= l;
    this.z /= l;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setFromUnitVectors() {
    return this;
  }
};
var Object3D = class {
  constructor() {
    this.children = [];
    this.userData = {};
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.quaternion = new Vector3();
  }
  add(o) {
    this.children.push(o);
    return this;
  }
  traverse(fn) {
    fn(this);
    this.children.forEach((c) => c.traverse ? c.traverse(fn) : fn(c));
  }
};
var Group = class extends Object3D {
};
var Mesh = class extends Object3D {
  constructor(g, m) {
    super();
    this.geometry = g;
    this.material = m;
  }
};
var geo = class {
  constructor() {
  }
  dispose() {
  }
};
var mat = class {
  constructor(opts) {
    Object.assign(this, opts || {});
  }
  dispose() {
  }
};
var Scene = Group;
var CylinderGeometry = geo;
var BoxGeometry = geo;
var PlaneGeometry = geo;
var MeshStandardMaterial = mat;
var MeshBasicMaterial = mat;
var PerspectiveCamera = class extends Object3D {
  updateProjectionMatrix() {
  }
};
var WebGLRenderer = class {
  constructor() {
    this.domElement = { addEventListener() {
    }, removeEventListener() {
    }, style: {}, getRootNode: () => document };
  }
  render() {
  }
  setSize() {
  }
  dispose() {
  }
  setPixelRatio() {
  }
};
var DirectionalLight = Group;
var HemisphereLight = Group;
var Color = class {
  constructor(c) {
    this.c = c;
  }
  set() {
  }
};

// .audit-work/foundation-phaseb3/verify/stubs/lucide-react.js
var icon = (name) => (props) => ({ type: "icon", props: { ...props || {}, icon: name } });
var Trash2 = icon("Trash2");
var Box = icon("Box");
var Copy = icon("Copy");
var Maximize2 = icon("Maximize2");
var RotateCcw = icon("RotateCcw");
var Eye = icon("Eye");
var EyeOff = icon("EyeOff");
var Plus = icon("Plus");
var Edit = icon("Edit");
var Package = icon("Package");
var Building2 = icon("Building2");
var Layers = icon("Layers");
var Wrench = icon("Wrench");
var Square = icon("Square");
var Loader2 = icon("Loader2");
var LogIn = icon("LogIn");
var AlertCircle = icon("AlertCircle");
var X = icon("X");
var CheckCircle = icon("CheckCircle");
var ChevronDown = icon("ChevronDown");
var Info = icon("Info");

// .audit-work/foundation-phaseb3/verify/stubs/jsx-runtime.js
var jsx = (type, props) => ({ type, props: props || {} });
var jsxs = jsx;
var Fragment2 = "Fragment";

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/Foundation3DPreview.jsx
var IN = 1 / 12;
function buildScene(scene, project, solid, showGround) {
  const group = new Group();
  const concreteMat = solid ? new MeshStandardMaterial({ color: 10265519, roughness: 0.9 }) : new MeshBasicMaterial({ color: 3621201, wireframe: true });
  const poleMat = solid ? new MeshStandardMaterial({ color: 4937059, metalness: 0.4, roughness: 0.5 }) : new MeshBasicMaterial({ color: 2042167, wireframe: true });
  let cursorX = 0;
  const items = project.items || [];
  items.forEach((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const depth = (Number(item.depth_inches) || 0) * IN;
    for (let i = 0; i < qty; i++) {
      let mesh;
      let footprint;
      if (item.foundation_type === "pillar") {
        const r = (Number(item.diameter) || 0) / 2 * IN;
        footprint = r * 2;
        mesh = new Mesh(new CylinderGeometry(r, r, depth, 24), concreteMat);
      } else {
        const l = (Number(item.length_inches) || 0) * IN;
        const w = (Number(item.width_inches) || 0) * IN;
        footprint = Math.max(l, w);
        mesh = new Mesh(new BoxGeometry(l, depth, w), concreteMat);
      }
      const offset = (Number(item.grade_offset_inches) || 0) * IN;
      mesh.position.set(cursorX + footprint / 2, -depth / 2 + offset, 0);
      mesh.rotation.y = (Number(item.rotation_degrees) || 0) * Math.PI / 180;
      group.add(mesh);
      if (item.selected_pole_id || item.pole_total_height_inches) {
        const h = (Number(item.pole_total_height_inches) || 96) * IN;
        const pole = new Mesh(new CylinderGeometry(0.35, 0.35, h, 16), poleMat);
        pole.position.set(mesh.position.x, offset + h / 2, 0);
        group.add(pole);
      }
      cursorX += footprint + 2;
    }
  });
  (project.poles || []).forEach((p) => {
    const height = (Number(p.height_inches) || 96) * IN;
    const embed = (Number(p.embedment_inches ?? p.y_offset_inches) || 0) * IN;
    const base = (Number(p.base_offset_inches) || 0) * IN;
    const len = height + embed;
    const shape = typeof p.pole_shape === "string" ? p.pole_shape.toLowerCase() : "round";
    let pole;
    if (shape === "square" || shape === "rectangular") {
      pole = new Mesh(new BoxGeometry(0.7, len, shape === "rectangular" ? 0.45 : 0.7), poleMat);
    } else {
      pole = new Mesh(new CylinderGeometry(0.35, 0.35, len, 16), poleMat);
      if (shape === "elliptical") pole.scale.z = 0.55;
    }
    pole.position.set(
      (Number(p.x_inches) || 0) * IN,
      base + (height - embed) / 2,
      (Number(p.z_inches) || 0) * IN
    );
    group.add(pole);
  });
  if (showGround) {
    const grid = new (void 0)(60, 60, 13751771, 15067115);
    grid.position.y = 0.01;
    group.add(grid);
    const ground = new Mesh(
      new PlaneGeometry(60, 60),
      new MeshStandardMaterial({ color: 15987958, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
  }
  const box = new (void 0)().setFromObject(group);
  const center = box.getCenter(new Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
  scene.add(group);
  return group;
}
function Foundation3DPreview({ project }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const [solid, setSolid] = useState(true);
  const [showGround, setShowGround] = useState(true);
  const [visible, setVisible] = useState(true);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    if (!visible || !mountRef.current) return;
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const scene = new Scene();
    scene.background = new Color(16382715);
    const camera = new PerspectiveCamera(45, width / height, 0.1, 2e3);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);
    scene.add(new HemisphereLight(16777215, 10265519, 1.1));
    const dir = new DirectionalLight(16777215, 0.7);
    dir.position.set(20, 30, 20);
    scene.add(dir);
    const st = stateRef.current;
    st.theta = st.theta ?? Math.PI / 4;
    st.phi = st.phi ?? Math.PI / 3.2;
    st.radius = st.radius ?? 30;
    st.target = st.target || new Vector3(0, 0, 0);
    const applyCamera = () => {
      const r = st.radius;
      camera.position.set(
        st.target.x + r * Math.sin(st.phi) * Math.cos(st.theta),
        st.target.y + r * Math.cos(st.phi),
        st.target.z + r * Math.sin(st.phi) * Math.sin(st.theta)
      );
      camera.lookAt(st.target);
    };
    buildScene(scene, project, solid, showGround);
    applyCamera();
    let frame;
    const render = () => {
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    let dragging = null;
    let last = { x: 0, y: 0 };
    const onDown = (e) => {
      dragging = e.button === 2 ? "pan" : "orbit";
      last = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (dragging === "orbit") {
        st.theta += dx * 8e-3;
        st.phi = Math.min(Math.PI / 2.02, Math.max(0.15, st.phi - dy * 6e-3));
      } else {
        const panScale = st.radius * 15e-4;
        st.target.x -= dx * panScale * Math.cos(st.theta + Math.PI / 2);
        st.target.z -= dx * panScale * Math.sin(st.theta + Math.PI / 2);
        st.target.y += dy * panScale;
      }
      applyCamera();
    };
    const onUp = () => dragging = null;
    const onWheel = (e) => {
      e.preventDefault();
      st.radius = Math.min(200, Math.max(3, st.radius * (1 + e.deltaY * 1e-3)));
      setZoom(Math.round(30 / st.radius * 100));
      applyCamera();
    };
    const onContext = (e) => e.preventDefault();
    const el = renderer.domElement;
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    stateRef.current.setView = (view) => {
      if (view === "front") {
        st.theta = -Math.PI / 2;
        st.phi = Math.PI / 2.05;
      }
      if (view === "side") {
        st.theta = 0;
        st.phi = Math.PI / 2.05;
      }
      if (view === "top") {
        st.theta = -Math.PI / 2;
        st.phi = 0.16;
      }
      if (view === "reset") {
        st.theta = Math.PI / 4;
        st.phi = Math.PI / 3.2;
        st.radius = 30;
        st.target.set(0, 0, 0);
        setZoom(100);
      }
      applyCamera();
    };
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
  }, [project, solid, showGround, visible]);
  const setView = (v) => stateRef.current.setView?.(v);
  const ToolBtn = ({ children, onClick, active }) => /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      onClick,
      className: `h-[24px] px-2 rounded-sm border text-[11px] font-medium flex items-center gap-1 ${active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-700"}`,
      children
    }
  );
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-sm p-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("span", { className: "text-[12px] font-bold text-gray-800", children: "3D Preview" }),
        /* @__PURE__ */ jsx("span", { className: "text-[11px] text-gray-400 ml-2", children: "Updates live as you edit" })
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setVisible((v) => !v),
          className: "text-[11px] font-medium text-gray-600 hover:text-red-600 flex items-center gap-1",
          children: [
            visible ? /* @__PURE__ */ jsx(EyeOff, { className: "w-3.5 h-3.5", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(Eye, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
            visible ? "Hide 3D View" : "Show 3D View"
          ]
        }
      )
    ] }),
    visible && /* @__PURE__ */ jsxs(Fragment2, { children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 flex-wrap mb-2", children: [
        /* @__PURE__ */ jsx(ToolBtn, { onClick: () => setView("front"), children: "Front" }),
        /* @__PURE__ */ jsx(ToolBtn, { onClick: () => setView("side"), children: "Side" }),
        /* @__PURE__ */ jsx(ToolBtn, { onClick: () => setView("top"), children: "Top" }),
        /* @__PURE__ */ jsxs(ToolBtn, { onClick: () => setView("reset"), children: [
          /* @__PURE__ */ jsx(RotateCcw, { className: "w-3 h-3", "aria-hidden": "true" }),
          " Reset"
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "text-[11px] text-gray-500 px-1", children: [
          zoom,
          "%"
        ] }),
        /* @__PURE__ */ jsx(ToolBtn, { onClick: () => setShowGround((v) => !v), active: !showGround, children: showGround ? "Hide Ground" : "Show Ground" }),
        /* @__PURE__ */ jsxs(ToolBtn, { onClick: () => setSolid((v) => !v), active: solid, children: [
          /* @__PURE__ */ jsx(Box, { className: "w-3 h-3", "aria-hidden": "true" }),
          " ",
          solid ? "Solid Mode" : "Wireframe"
        ] }),
        /* @__PURE__ */ jsxs(ToolBtn, { onClick: () => mountRef.current?.requestFullscreen?.(), children: [
          /* @__PURE__ */ jsx(Maximize2, { className: "w-3 h-3", "aria-hidden": "true" }),
          " Full Screen"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { ref: mountRef, className: "w-full h-[420px] rounded-sm overflow-hidden bg-gray-50" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-[10px] text-gray-500 mt-1 px-1", children: [
        /* @__PURE__ */ jsx("span", { children: "Left Click + Drag: Orbit/Rotate" }),
        /* @__PURE__ */ jsx("span", { children: "Right Click + Drag: Pan/Move" }),
        /* @__PURE__ */ jsx("span", { children: "Scroll Wheel: Zoom in/out" })
      ] })
    ] })
  ] });
}
export {
  Foundation3DPreview as default
};
