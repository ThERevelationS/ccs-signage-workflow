import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

// Lazy ambient 3D scene. Three.js is imported inside the effect so the host
// page's critical path never waits on the GL chunk. Reduced-motion renders a
// single static frame; the loop pauses when the tab is hidden.
export default function SceneCanvas({ className }) {
  const hostRef = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer = null;
    let scene = null;
    let camera = null;
    let group = null;
    let raf = 0;
    let cancelled = false;
    let cleanupVis = null;

    const start = async () => {
      const THREE = await import("three");
      if (cancelled || !hostRef.current) return;
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      host.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
      camera.position.set(0, 0, 7);

      const wire = (color, opacity) =>
        new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity });
      group = new THREE.Group();
      const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 0), wire(0x8b5cf6, 0.5));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.02, 8, 80), wire(0x6366f1, 0.45));
      ring.rotation.x = Math.PI / 2.4;
      const outer = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.015, 8, 90), wire(0x22d3ee, 0.35));
      outer.rotation.x = Math.PI / 1.8;
      outer.rotation.y = 0.4;
      group.add(ico, ring, outer);
      scene.add(group);

      const render = (t) => {
        const s = t * 0.001;
        group.rotation.y = s * 0.25;
        group.rotation.x = Math.sin(s * 0.4) * 0.12;
        ico.rotation.z = s * 0.35;
        ico.position.y = Math.sin(s * 0.8) * 0.15;
        renderer.render(scene, camera);
      };

      if (reduceMotion) {
        render(0);
        return;
      }
      const loop = (t) => {
        if (cancelled) return;
        render(t);
        raf = requestAnimationFrame(loop);
      };
      const onVis = () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
          raf = 0;
        } else if (!raf && !cancelled) {
          raf = requestAnimationFrame(loop);
        }
      };
      document.addEventListener("visibilitychange", onVis);
      cleanupVis = () => document.removeEventListener("visibilitychange", onVis);
      raf = requestAnimationFrame(loop);
    };

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanupVis?.();
      group?.traverse?.((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      });
      renderer?.dispose?.();
      renderer?.domElement?.remove?.();
    };
  }, [reduceMotion]);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
