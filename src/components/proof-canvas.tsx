import modelAsset from "../../assets/models/Avocado.glb";
import { useCallback, useEffect, useRef } from "react";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  ThreeView,
  type Metrics,
  type SceneContext,
} from "../../packages/three-native/runtime/ThreeView";
import { createProofScene, type Sample } from "../lib/proof-scene";
export type { Metrics } from "../../packages/three-native/runtime/ThreeView";

type Proof = ReturnType<typeof createProofScene>;
export function ProofCanvas({
  sample,
  paused,
  finish,
  reset,
  onPick,
  onMetrics,
}: {
  sample: Sample;
  paused: boolean;
  finish: number;
  reset: number;
  onPick: () => void;
  onMetrics: (metrics: Metrics) => void;
}) {
  const current = useRef<Proof | null>(null);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
    current.current?.setFinish(finish);
  }, [finish]);
  useEffect(() => {
    current.current?.resetCamera();
  }, [reset]);
  const createScene = useCallback(
    async ({ resolveAsset }: SceneContext) => {
      let model;
      if (sample === "model") {
        const response = await fetch(await resolveAsset(modelAsset));
        if (!response.ok && response.status !== 0)
          throw new Error(`Model load failed: ${response.status}`);
        // Parse bytes directly: FileLoader progress streams are incompatible with native Response.
        const data = await response.arrayBuffer();
        model = (await new GLTFLoader().parseAsync(data, "")).scene;
      }
      const proof = createProofScene(sample, model);
      return {
        ...proof,
        onPointer(x: number, y: number) {
          if (proof.hit(x, y)) onPick();
        },
      };
    },
    [sample, onPick],
  );
  const ready = useCallback((proof: Proof | null) => {
    current.current = proof;
    proof?.setFinish(finishRef.current);
  }, []);
  return (
    <ThreeView
      createScene={createScene}
      paused={paused}
      onMetrics={onMetrics}
      onReady={ready}
    />
  );
}
