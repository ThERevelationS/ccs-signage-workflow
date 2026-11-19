// .audit-work/foundation-o029-cutschedule/verify/stubs/three.js
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
var Line = class extends Object3D {
  constructor(g, m) {
    super();
    this.geometry = g;
    this.material = m;
  }
  computeLineDistances() {
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
var BufferGeometry = class {
  constructor() {
    this.points = [];
  }
  setFromPoints(p) {
    this.points = p;
    return this;
  }
  dispose() {
  }
};
var CylinderGeometry = geo;
var TorusGeometry = geo;
var MeshStandardMaterial = mat;
var LineDashedMaterial = mat;

// .audit-work/foundation-o029-cutschedule/candidate-tree-src/components/estimator/foundation/foundationReinforcementThreePreview.js
var FOUNDATION_REINFORCEMENT_3D_ROLES = Object.freeze([
  Object.freeze({ role: "horizontal", label: "Mats", color: "#15803d" }),
  Object.freeze({ role: "longitudinal", label: "Longitudinal", color: "#2563eb" }),
  Object.freeze({ role: "hoop", label: "Hoops", color: "#b45309" }),
  Object.freeze({ role: "inter_mat_tie", label: "Tie references", color: "#0891b2" }),
  Object.freeze({ role: "support", label: "Supports", color: "#7c3aed" })
]);
function createFoundationReinforcement3DGroup(primitives) {
  const group = new Group();
  group.userData = { foundationReinforcement: true, engineeringApproved: false };
  const materials = /* @__PURE__ */ new Map();
  for (const primitive of primitives) {
    const role = FOUNDATION_REINFORCEMENT_3D_ROLES.find((record) => record.role === primitive.role);
    if (!role) throw new Error("Unsupported preliminary reinforcement geometry role.");
    const key = primitive.kind === "tie_reference" ? "tie_reference" : primitive.role;
    if (!materials.has(key)) materials.set(key, primitive.kind === "tie_reference" ? new LineDashedMaterial({ color: role.color, dashSize: 0.08, gapSize: 0.04 }) : new MeshStandardMaterial({ color: role.color, roughness: 0.45, metalness: 0.35 }));
    const material = materials.get(key);
    let object;
    if (primitive.kind === "segment") {
      const from = new Vector3(...primitive.from), to = new Vector3(...primitive.to);
      object = new Mesh(new CylinderGeometry(primitive.radiusFeet, primitive.radiusFeet, primitive.lengthFeet, 8), material);
      object.position.copy(from.clone().add(to).multiplyScalar(0.5));
      object.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.sub(from).normalize());
    } else if (primitive.kind === "hoop") {
      object = new Mesh(new TorusGeometry(primitive.centerlineRadiusFeet, primitive.radiusFeet, 8, 64), material);
      object.rotation.x = Math.PI / 2;
      object.position.set(...primitive.center);
    } else if (primitive.kind === "tie_reference") {
      object = new Line(new BufferGeometry().setFromPoints([
        new Vector3(...primitive.from),
        new Vector3(...primitive.to)
      ]), material);
      object.computeLineDistances();
    } else throw new Error("Unsupported preliminary reinforcement geometry kind.");
    object.userData = { reinforcementId: primitive.id, role: primitive.role, kind: primitive.kind, engineeringApproved: false };
    group.add(object);
  }
  return group;
}
function disposeFoundationPreviewScene(scene) {
  const geometries = /* @__PURE__ */ new Set(), materials = /* @__PURE__ */ new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const value = object.material;
    for (const material of Array.isArray(value) ? value : value ? [value] : []) materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
export {
  FOUNDATION_REINFORCEMENT_3D_ROLES,
  createFoundationReinforcement3DGroup,
  disposeFoundationPreviewScene
};
