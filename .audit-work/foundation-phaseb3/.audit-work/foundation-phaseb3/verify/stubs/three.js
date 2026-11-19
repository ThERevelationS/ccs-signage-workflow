
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setFromUnitVectors() { return this; }
}
class Object3D {
  constructor() { this.children = []; this.userData = {}; this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0 }; this.quaternion = new Vector3(); }
  add(o) { this.children.push(o); return this; }
  traverse(fn) { fn(this); this.children.forEach(c => c.traverse ? c.traverse(fn) : fn(c)); }
}
class Group extends Object3D {}
class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
class Line extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } computeLineDistances() {} }
const geo = class { constructor() {} dispose() {} };
const mat = class { constructor(opts) { Object.assign(this, opts || {}); } dispose() {} };
class BufferGeometry { constructor() { this.points = []; } setFromPoints(p) { this.points = p; return this; } dispose() {} }
export { Vector3, Group, Mesh, Line, BufferGeometry, Object3D };
export const Scene = Group;
export const CylinderGeometry = geo, TorusGeometry = geo, BoxGeometry = geo, SphereGeometry = geo, PlaneGeometry = geo;
export const MeshStandardMaterial = mat, LineDashedMaterial = mat, MeshBasicMaterial = mat;
export const PerspectiveCamera = class extends Object3D { updateProjectionMatrix() {} };
export const WebGLRenderer = class { constructor() { this.domElement = { addEventListener() {}, removeEventListener() {}, style: {}, getRootNode: () => document }; } render() {} setSize() {} dispose() {} setPixelRatio() {} };
export const AmbientLight = Group, DirectionalLight = Group, HemisphereLight = Group;
export const Color = class { constructor(c) { this.c = c; } set() {} };
export const Fog = class {};
export const Raycaster = class {};
export const Vector2 = class {};
export const MathUtils = { degToRad: d => d * Math.PI / 180 };
export const DoubleSide = 2, FrontSide = 0;
