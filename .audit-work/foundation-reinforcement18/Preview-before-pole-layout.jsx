import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Maximize2, RotateCcw, Eye, EyeOff, Box } from "lucide-react";
import { buildFoundationReinforcementPreview3D, FOUNDATION_3D_PREVIEW_LIMITS } from "./foundationReinforcementPreview3D";
import {
  createFoundationReinforcement3DGroup,
  disposeFoundationPreviewScene,
  FOUNDATION_REINFORCEMENT_3D_ROLES,
} from "./foundationReinforcementThreePreview";

function buildScene(scene, project, solid, showGround, previewModel) {
  const group = new THREE.Group();

  const concreteMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 })
    : new THREE.MeshBasicMaterial({ color: 0x374151, wireframe: true });
  const poleMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.4, roughness: 0.5 })
    : new THREE.MeshBasicMaterial({ color: 0x1f2937, wireframe: true });

  previewModel.instances.forEach((instance) => {
    const item = project.items?.[instance.index];
    const [l, depth, w] = instance.dimensionsFeet;
    let mesh;
    if (instance.type === "pillar") {
      const r = l / 2;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 24), concreteMat);
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(l, depth, w), concreteMat);
    }
    mesh.position.set(...instance.positionFeet);
    mesh.rotation.y = instance.rotationRadians;

    if (Array.isArray(instance.steel) && instance.steel.length > 0) {
      const steelMat = concreteMat.clone();
      steelMat.transparent = true;
      steelMat.opacity = 0.18;
      steelMat.depthWrite = false;
      mesh.material = steelMat;
      mesh.add(createFoundationReinforcement3DGroup(instance.steel));
    }
    group.add(mesh);

    if (item && (item.selected_pole_id || item.pole_total_height_inches)) {
      const h = (Number(item.pole_total_height_inches) || 96) / 12;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, h, 16), poleMat);
      pole.position.set(mesh.position.x, instance.positionFeet[1] + depth / 2 + h / 2, 0);
      group.add(pole);
    }
  });

  (project.poles || []).forEach((p) => {
    const h = (Number(p.height_inches) || 96) / 12;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, h, 16), poleMat);
    pole.position.set(
      (Number(p.x_inches) || 0) / 12,
      (Number(p.y_offset_inches) || 0) / 12 + h / 2,
      (Number(p.z_inches) || 0) / 12
    );
    group.add(pole);
  });

  // center the model horizontally before adding the ground plane so the
  // oversized ground does not bias the inspection camera
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
  scene.add(group);

  if (showGround) {
    const grid = new THREE.GridHelper(60, 60, 0xd1d5db, 0xe5e7eb);
    grid.position.y = 0.01;
    scene.add(grid);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 1 });
    if (previewModel.steelCount > 0) {
      groundMat.transparent = true;
      groundMat.opacity = 0.12;
      groundMat.depthWrite = false;
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
  }

  return group;
}

export default function Foundation3DPreview({ project }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const [solid, setSolid] = useState(true);
  const [showGround, setShowGround] = useState(true);
  const [showReinforcement, setShowReinforcement] = useState(true);
  const [visible, setVisible] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [rendererError, setRendererError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const previewModel = useMemo(
    () => buildFoundationReinforcementPreview3D(project, { showReinforcement }),
    [project, showReinforcement]
  );

  useEffect(() => {
    if (!visible || !mountRef.current) return;
    const mount = mountRef.current;
    setRendererError("");

    const scene = new THREE.Scene();
    let renderer = null;
    let el = null;
    let frame;
    let resizeObserver = null;
    const removers = [];
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      removers.forEach((remove) => remove());
      delete stateRef.current.setView;
      disposeFoundationPreviewScene(scene);
      renderer?.dispose();
      if (el?.parentNode === mount) mount.removeChild(el);
    };
    const listen = (target, name, handler, options) => {
      target.addEventListener(name, handler, options);
      removers.push(() => target.removeEventListener(name, handler, options));
    };

    try {
      scene.background = new THREE.Color(0xf9fafb);
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(width, height);
      mount.appendChild(renderer.domElement);
      el = renderer.domElement;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca3af, 1.1));
      const dir = new THREE.DirectionalLight(0xffffff, 0.7);
      dir.position.set(20, 30, 20);
      scene.add(dir);

      const st = stateRef.current;
      st.theta = st.theta ?? Math.PI / 4;
      st.phi = st.phi ?? Math.PI / 3.2;
      st.radius = st.radius ?? 30;
      st.target = st.target || new THREE.Vector3(0, 0, 0);

      const applyCamera = () => {
        const r = st.radius;
        camera.position.set(
          st.target.x + r * Math.sin(st.phi) * Math.cos(st.theta),
          st.target.y + r * Math.cos(st.phi),
          st.target.z + r * Math.sin(st.phi) * Math.sin(st.theta)
        );
        camera.lookAt(st.target);
      };

      buildScene(scene, project, solid, showGround, previewModel);
      applyCamera();

      const render = () => {
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();

      // --- controls ---
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
          st.theta += dx * 0.008;
          st.phi = Math.min(Math.PI / 2.02, Math.max(0.15, st.phi - dy * 0.006));
        } else {
          const panScale = st.radius * 0.0015;
          st.target.x -= dx * panScale * Math.cos(st.theta + Math.PI / 2);
          st.target.z -= dx * panScale * Math.sin(st.theta + Math.PI / 2);
          st.target.y += dy * panScale;
        }
        applyCamera();
      };
      const onUp = () => (dragging = null);
      const onWheel = (e) => {
        e.preventDefault();
        st.radius = Math.min(200, Math.max(3, st.radius * (1 + e.deltaY * 0.001)));
        setZoom(Math.round((30 / st.radius) * 100));
        applyCamera();
      };
      const onContext = (e) => e.preventDefault();

      listen(el, "mousedown", onDown);
      listen(window, "mousemove", onMove);
      listen(window, "mouseup", onUp);
      listen(el, "wheel", onWheel, { passive: false });
      listen(el, "contextmenu", onContext);

      const onResize = () => {
        const w = Math.max(1, mount.clientWidth);
        const h = Math.max(1, mount.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      listen(window, "resize", onResize);
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(mount);
      }

      st.setView = (view) => {
        if (view === "front") { st.theta = -Math.PI / 2; st.phi = Math.PI / 2.05; }
        if (view === "side") { st.theta = 0; st.phi = Math.PI / 2.05; }
        if (view === "top") { st.theta = -Math.PI / 2; st.phi = 0.16; }
        if (view === "reset") {
          st.theta = Math.PI / 4;
          st.phi = Math.PI / 3.2;
          st.radius = 30;
          st.target.set(0, 0, 0);
          setZoom(100);
        }
        applyCamera();
      };

      return cleanup;
    } catch {
      cleanup();
      setRendererError("3D preview is unavailable in this browser. Quantities and pricing are unchanged.");
      return undefined;
    }
  }, [project, solid, showGround, visible, previewModel, retryNonce]);

  const setView = (v) => stateRef.current.setView?.(v);

  const ToolBtn = ({ children, onClick, active, ariaPressed }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed}
      className={`h-[24px] px-2 rounded-sm border text-[11px] font-medium flex items-center gap-1 ${
        active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-700"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-sm p-2">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="min-w-0">
          <span className="text-[12px] font-bold text-gray-800">3D Preview</span>
          <span className="text-[11px] text-gray-400 ml-2">Updates live as you edit</span>
        </div>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-[11px] font-medium text-gray-600 hover:text-red-600 flex items-center gap-1"
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
          {visible ? "Hide 3D View" : "Show 3D View"}
        </button>
      </div>
      <p className="text-[10px] text-gray-500 mb-2">
        Schematic overview only: instances are arranged for inspection, not saved 2D placement.
      </p>

      {visible && (
        <>
          <div className="flex items-center gap-1 flex-wrap mb-2">
            <ToolBtn onClick={() => setView("front")}>Front</ToolBtn>
            <ToolBtn onClick={() => setView("side")}>Side</ToolBtn>
            <ToolBtn onClick={() => setView("top")}>Top</ToolBtn>
            <ToolBtn onClick={() => setView("reset")}>
              <RotateCcw className="w-3 h-3" aria-hidden="true" /> Reset
            </ToolBtn>
            <span className="text-[11px] text-gray-500 px-1">{zoom}%</span>
            <ToolBtn onClick={() => setShowGround((v) => !v)} active={!showGround}>
              {showGround ? "Hide Ground" : "Show Ground"}
            </ToolBtn>
            <ToolBtn onClick={() => setSolid((v) => !v)} active={solid}>
              <Box className="w-3 h-3" aria-hidden="true" /> {solid ? "Solid Mode" : "Wireframe"}
            </ToolBtn>
            {previewModel.hasVersioned && (
              <ToolBtn onClick={() => setShowReinforcement((v) => !v)} active={showReinforcement} ariaPressed={showReinforcement}>
                Reinforcement
              </ToolBtn>
            )}
            <ToolBtn onClick={() => mountRef.current?.requestFullscreen?.()}>
              <Maximize2 className="w-3 h-3" aria-hidden="true" /> Full Screen
            </ToolBtn>
          </div>

          <div className="relative">
            <div ref={mountRef} className="w-full h-[420px] rounded-sm overflow-hidden bg-gray-50" />
            {rendererError && (
              <div role="alert" className="absolute inset-0 rounded-sm border border-amber-200 bg-amber-50 flex flex-col items-center justify-center gap-2 text-[12px] text-amber-800">
                <p>{rendererError}</p>
                <button
                  type="button"
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="rounded-sm border border-amber-400 bg-white px-2 py-1 text-[12px] text-amber-800"
                >
                  Retry 3D
                </button>
              </div>
            )}
          </div>

          {previewModel.hasVersioned && (
            <div className="mt-1 rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 space-y-1">
              <p className="text-[10px] text-gray-500">
                Version-2 steel is preliminary current-design geometry, not a frozen price, stock/cut schedule, or engineering approval.
              </p>
              <p className="text-[10px] text-gray-500">
                Support items and hook/bend allowances are not drawn. Dashed ties are reference paths only.
              </p>
              {previewModel.steelCount > 0 && (
                <p className="text-[10px] text-gray-500">Concrete and ground are faded to inspect version-2 steel.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {FOUNDATION_REINFORCEMENT_3D_ROLES.map((role) => (
                  <span key={role.role} className="flex items-center gap-1 text-[10px] text-gray-600">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: role.color }} />
                    {role.label}
                  </span>
                ))}
                <span className="text-[10px] text-gray-500">{rendererError ? `${previewModel.steelCount} steel primitives prepared; rendering unavailable.` : `${previewModel.steelCount} steel primitives shown`}</span>
              </div>
            </div>
          )}

          {previewModel.clipped && (
            <div role="alert" className="mt-1 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
              Preview clipped to {FOUNDATION_3D_PREVIEW_LIMITS.instances} foundation instances / {FOUNDATION_3D_PREVIEW_LIMITS.steelPrimitives} steel primitives; calculated quantities are unchanged.
            </div>
          )}
          {previewModel.issues.length > 0 && (
            <div role="alert" className="mt-1 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 space-y-0.5">
              {previewModel.issues.slice(0, 8).map((issue, i) => (
                <p key={i} className={`text-[10px] ${issue.severity === "error" ? "text-red-700" : "text-amber-800"}`}>{issue.message || String(issue)}</p>
              ))}
              {previewModel.issues.length > 8 && (
                <p className="text-[10px] text-amber-800">...and {previewModel.issues.length - 8} more</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1 px-1">
            <span>Left Click + Drag: Orbit/Rotate</span>
            <span>Right Click + Drag: Pan/Move</span>
            <span>Scroll Wheel: Zoom in/out</span>
          </div>
        </>
      )}
    </div>
  );
}
