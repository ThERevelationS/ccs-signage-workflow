import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Maximize2, RotateCcw, Eye, EyeOff, Box } from "lucide-react";

const IN = 1 / 12; // inches -> feet units

function buildScene(scene, project, solid, showGround) {
  const group = new THREE.Group();

  const concreteMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 })
    : new THREE.MeshBasicMaterial({ color: 0x374151, wireframe: true });
  const poleMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.4, roughness: 0.5 })
    : new THREE.MeshBasicMaterial({ color: 0x1f2937, wireframe: true });

  let cursorX = 0;
  const items = project.items || [];
  items.forEach((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const depth = (Number(item.depth_inches) || 0) * IN;
    for (let i = 0; i < qty; i++) {
      let mesh;
      let footprint;
      if (item.foundation_type === "pillar") {
        const r = ((Number(item.diameter) || 0) / 2) * IN;
        footprint = r * 2;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 24), concreteMat);
      } else {
        const l = (Number(item.length_inches) || 0) * IN;
        const w = (Number(item.width_inches) || 0) * IN;
        footprint = Math.max(l, w);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(l, depth, w), concreteMat);
      }
      const offset = (Number(item.grade_offset_inches) || 0) * IN;
      mesh.position.set(cursorX + footprint / 2, -depth / 2 + offset, 0);
      mesh.rotation.y = ((Number(item.rotation_degrees) || 0) * Math.PI) / 180;
      group.add(mesh);

      if (item.selected_pole_id || item.pole_total_height_inches) {
        const h = (Number(item.pole_total_height_inches) || 96) * IN;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, h, 16), poleMat);
        pole.position.set(mesh.position.x, offset + h / 2, 0);
        group.add(pole);
      }

      cursorX += footprint + 2;
    }
  });

  (project.poles || []).forEach((p) => {
    const h = (Number(p.height_inches) || 96) * IN;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, h, 16), poleMat);
    pole.position.set(
      (Number(p.x_inches) || 0) * IN,
      (Number(p.y_offset_inches) || 0) * IN + h / 2,
      (Number(p.z_inches) || 0) * IN
    );
    group.add(pole);
  });

  if (showGround) {
    const grid = new THREE.GridHelper(60, 60, 0xd1d5db, 0xe5e7eb);
    grid.position.y = 0.01;
    group.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
  }

  // center the model horizontally
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;

  scene.add(group);
  return group;
}

export default function Foundation3DPreview({ project }) {
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf9fafb);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

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

    buildScene(scene, project, solid, showGround);
    applyCamera();

    let frame;
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

  const ToolBtn = ({ children, onClick, active }) => (
    <button
      type="button"
      onClick={onClick}
      className={`h-[24px] px-2 rounded-sm border text-[11px] font-medium flex items-center gap-1 ${
        active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-700"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-sm p-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[12px] font-bold text-gray-800">3D Preview</span>
          <span className="text-[11px] text-gray-400 ml-2">Updates live as you edit</span>
        </div>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-[11px] font-medium text-gray-600 hover:text-red-600 flex items-center gap-1"
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {visible ? "Hide 3D View" : "Show 3D View"}
        </button>
      </div>

      {visible && (
        <>
          <div className="flex items-center gap-1 flex-wrap mb-2">
            <ToolBtn onClick={() => setView("front")}>Front</ToolBtn>
            <ToolBtn onClick={() => setView("side")}>Side</ToolBtn>
            <ToolBtn onClick={() => setView("top")}>Top</ToolBtn>
            <ToolBtn onClick={() => setView("reset")}>
              <RotateCcw className="w-3 h-3" /> Reset
            </ToolBtn>
            <span className="text-[11px] text-gray-500 px-1">{zoom}%</span>
            <ToolBtn onClick={() => setShowGround((v) => !v)} active={!showGround}>
              {showGround ? "Hide Ground" : "Show Ground"}
            </ToolBtn>
            <ToolBtn onClick={() => setSolid((v) => !v)} active={solid}>
              <Box className="w-3 h-3" /> {solid ? "Solid Mode" : "Wireframe"}
            </ToolBtn>
            <ToolBtn onClick={() => mountRef.current?.requestFullscreen?.()}>
              <Maximize2 className="w-3 h-3" /> Full Screen
            </ToolBtn>
          </div>

          <div ref={mountRef} className="w-full h-[420px] rounded-sm overflow-hidden bg-gray-50" />

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