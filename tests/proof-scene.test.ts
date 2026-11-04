import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three/webgpu";
import { createProofScene, disposeObject } from "../src/lib/proof-scene.ts";

test("scene renders 64 instances and bounded updates survive a background time gap", () => {
  const proof = createProofScene("sculpture");
  const beads = proof.scene.children.find(
    (object) => object instanceof THREE.InstancedMesh,
  );
  assert.equal((beads as THREE.InstancedMesh).count, 64);
  proof.resize(400, 800);
  assert.equal(proof.camera.aspect, 0.5);
  proof.resize(0, 0);
  assert.equal(proof.camera.aspect, 0.5);
  proof.update(600);
  assert.ok(proof.root.rotation.y <= 0.018);
  assert.equal(proof.hit(0.5, 0.5), true);
  proof.resetCamera();
  assert.equal(proof.root.rotation.y, 0);
  proof.dispose();
});
test("model input is required and oversized models fit the shared stage", () => {
  assert.throws(() => createProofScene("model"), /loaded model/);
  const model = new THREE.Mesh(
    new THREE.BoxGeometry(100, 50, 20),
    new THREE.MeshStandardMaterial(),
  );
  const proof = createProofScene("model", model);
  assert.ok(
    Math.abs(
      new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x -
        2.7,
    ) < 1e-6,
  );
  proof.dispose();
});
test("shared geometry and material resources are disposed once", () => {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  let geometryDisposed = 0,
    materialDisposed = 0;
  geometry.addEventListener("dispose", () => geometryDisposed++);
  material.addEventListener("dispose", () => materialDisposed++);
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  disposeObject(root);
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
});
