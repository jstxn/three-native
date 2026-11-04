import * as THREE from "three";
import { createScene } from "./scene.js";
const demo = createScene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.appendChild(renderer.domElement);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  demo.camera.aspect = innerWidth / innerHeight;
  demo.camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);
window.addEventListener("pointerup", () => demo.onPointer());
let previous = 0;
renderer.setAnimationLoop((time) => {
  demo.update(previous ? Math.min((time - previous) / 1000, 0.05) : 0);
  previous = time;
  renderer.render(demo.scene, demo.camera);
});
