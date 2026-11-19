// src/components/estimator/foundation/foundationReinforcementThreePreview.js
import * as THREE from "three";
var FOUNDATION_REINFORCEMENT_3D_ROLES = Object.freeze([
  Object.freeze({ role: "horizontal", label: "Mats", color: "#15803d" }),
  Object.freeze({ role: "longitudinal", label: "Longitudinal", color: "#2563eb" }),
  Object.freeze({ role: "hoop", label: "Hoops", color: "#b45309" }),
  Object.freeze({ role: "inter_mat_tie", label: "Tie references", color: "#0891b2" }),
  Object.freeze({ role: "support", label: "Supports", color: "#7c3aed" })
]);
function createFoundationReinforcement3DGroup(primitives) {
  const group = new THREE.Group();
  group.userData = { foundationReinforcement: true, engineeringApproved: false };
  const materials = /* @__PURE__ */ new Map();
  for (const primitive of primitives) {
    const role = FOUNDATION_REINFORCEMENT_3D_ROLES.find((record) => record.role === primitive.role);
    if (!role) throw new Error("Unsupported preliminary reinforcement geometry role.");
    const key = primitive.kind === "tie_reference" ? "tie_reference" : primitive.role;
    if (!materials.has(key)) materials.set(key, primitive.kind === "tie_reference" ? new THREE.LineDashedMaterial({ color: role.color, dashSize: 0.08, gapSize: 0.04 }) : new THREE.MeshStandardMaterial({ color: role.color, roughness: 0.45, metalness: 0.35 }));
    const material = materials.get(key);
    let object;
    if (primitive.kind === "segment") {
      const from = new THREE.Vector3(...primitive.from), to = new THREE.Vector3(...primitive.to);
      object = new THREE.Mesh(new THREE.CylinderGeometry(primitive.radiusFeet, primitive.radiusFeet, primitive.lengthFeet, 8), material);
      object.position.copy(from.clone().add(to).multiplyScalar(0.5));
      object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
    } else if (primitive.kind === "hoop") {
      object = new THREE.Mesh(new THREE.TorusGeometry(primitive.centerlineRadiusFeet, primitive.radiusFeet, 8, 64), material);
      object.rotation.x = Math.PI / 2;
      object.position.set(...primitive.center);
    } else if (primitive.kind === "tie_reference") {
      object = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...primitive.from),
        new THREE.Vector3(...primitive.to)
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
