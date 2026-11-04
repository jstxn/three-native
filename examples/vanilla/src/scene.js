import * as THREE from "three/webgpu";

// Shared by the existing Vite site and the generated native app.
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dde8ee");
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.4, 7.5);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight("#ffffff", "#3a5064", 3));
  const light = new THREE.DirectionalLight("#fff1df", 4);
  light.position.set(2, 3, 4);
  scene.add(light);
  const material = new THREE.MeshStandardMaterial({
    color: "#b95c3c",
    metalness: 0.6,
    roughness: 0.3,
  });
  const mesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.7, 0.23, 96, 16),
    material,
  );
  scene.add(mesh);
  return {
    scene,
    camera,
    update(delta) {
      mesh.rotation.y += delta * 0.5;
    },
    onPointer() {
      material.color.set(
        material.color.getHexString() === "b95c3c" ? "#297d8d" : "#b95c3c",
      );
    },
  };
}
