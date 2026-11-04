import * as THREE from "three/webgpu";

export type Sample = "sculpture" | "model";
export const finishes = ["#b95c3c", "#297d8d", "#d2a34e"];

export function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    if (child instanceof THREE.InstancedMesh) child.dispose();
    for (const material of Array.isArray(child.material)
      ? child.material
      : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    texture.dispose();
    const image = texture.source.data;
    if (
      image &&
      typeof image === "object" &&
      "close" in image &&
      typeof image.close === "function"
    )
      image.close();
  }
}

export function createProofScene(sample: Sample, model?: THREE.Object3D) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dde8ee");
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight("#ffffff", "#5d7084", 3));
  const key = new THREE.DirectionalLight("#fff3df", 4);
  key.position.set(4, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight("#a9e3ff", 3);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  if (sample === "model") {
    if (!model) throw new Error("The glTF sample needs a loaded model.");
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 2.7 / Math.max(size.x, size.y, size.z);
    model.scale.multiplyScalar(scale);
    model.position.sub(
      bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale),
    );
    root.add(model);
  } else {
    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.82, 0.28, 128, 24),
      new THREE.MeshStandardMaterial({
        color: finishes[0],
        metalness: 0.65,
        roughness: 0.25,
      }),
    );
    root.add(knot);
    const beads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.045, 12, 8),
      new THREE.MeshStandardMaterial({
        color: "#4e7386",
        metalness: 0.35,
        roughness: 0.3,
      }),
      64,
    );
    const transform = new THREE.Object3D();
    for (let i = 0; i < 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      transform.position.set(
        Math.cos(angle) * 1.7,
        Math.sin(angle * 3) * 0.17,
        Math.sin(angle) * 1.7,
      );
      transform.updateMatrix();
      beads.setMatrixAt(i, transform.matrix);
    }
    beads.instanceMatrix.needsUpdate = true;
    scene.add(beads);
  }

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(1.75, 1.82, 0.16, 64),
    new THREE.MeshStandardMaterial({ color: "#bcced8", roughness: 0.88 }),
  );
  ground.position.y = -1.6;
  scene.add(ground);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function resetCamera() {
    camera.position.set(3.4, 2.4, 6.2);
    camera.lookAt(0, -0.15, 0);
    camera.updateMatrixWorld();
    root.rotation.set(0, 0, 0);
  }
  resetCamera();
  return {
    scene,
    camera,
    root,
    update(delta: number) {
      root.rotation.y += Math.min(Math.max(delta, 0), 0.05) * 0.35;
    },
    resize(width: number, height: number) {
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    setFinish(index: number) {
      if (sample === "sculpture") {
        const mesh = root.children[0] as THREE.Mesh<
          THREE.TorusKnotGeometry,
          THREE.MeshStandardMaterial
        >;
        mesh.material.color.set(finishes[index % finishes.length]);
      } else {
        root.rotation.y += Math.PI / 3;
      }
    },
    hit(x: number, y: number) {
      scene.updateMatrixWorld(true);
      pointer.set(x * 2 - 1, 1 - y * 2);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(root, true).length > 0;
    },
    resetCamera,
    dispose() {
      disposeObject(scene);
    },
  };
}
