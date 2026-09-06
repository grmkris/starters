import { useGLTF } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { Mesh, MeshStandardMaterial } from "three";

/**
 * A place a model can go.
 *
 * Given a URL, the slot loads a glTF and shows it; while it loads, or if it
 * cannot be loaded at all, it shows the procedural fallback instead. That is
 * the whole drop-in mechanism: put a file at the path and it is used, remove
 * it and the game is unchanged. Materials named `Body` and `Accent` are
 * recoloured to the player's palette on load, so one model serves both sides.
 */

export type ModelState = "loaded" | "fallback";

interface ModelSlotProps {
  readonly url: string | undefined;
  readonly fallback: ReactNode;
  readonly colour: string;
  readonly glow: string;
  readonly onState?: ((state: ModelState) => void) | undefined;
}

interface LoadedProps {
  readonly url: string;
  readonly colour: string;
  readonly glow: string;
  readonly onState?: ((state: ModelState) => void) | undefined;
}

const Loaded = ({ colour, glow, onState, url }: LoadedProps) => {
  const { scene } = useGLTF(url);
  const instance = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }
      // `instanceof Mesh` narrows to a Mesh with `any` generics, so the
      // material is taken as unknown and narrowed by its own class.
      const candidate: unknown = child.material;
      if (!(candidate instanceof MeshStandardMaterial)) {
        return;
      }
      const material = candidate;
      if (material.name === "Body") {
        child.material = new MeshStandardMaterial({
          color: colour,
          emissive: glow,
          emissiveIntensity: 0.35,
          flatShading: true,
          metalness: 0.25,
          roughness: 0.5,
        });
      } else if (material.name === "Accent") {
        child.material = new MeshStandardMaterial({
          color: colour,
          emissive: colour,
          emissiveIntensity: 1.2,
          flatShading: true,
          toneMapped: false,
        });
      }
    });
    return cloned;
  }, [colour, glow, scene]);

  useEffect(() => {
    onState?.("loaded");
  }, [onState]);

  return <primitive object={instance} />;
};

interface BoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly onFallback?: () => void;
}

interface BoundaryState {
  readonly failed: boolean;
}

/** A missing or broken file must cost a model, never the lane. */
class Boundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onFallback?.();
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export const ModelSlot = ({
  colour,
  fallback,
  glow,
  onState,
  url,
}: ModelSlotProps): ReactNode => {
  useEffect(() => {
    if (url === undefined) {
      onState?.("fallback");
    }
  }, [onState, url]);

  if (url === undefined) {
    return fallback;
  }
  return (
    <Boundary
      fallback={fallback}
      onFallback={() => {
        onState?.("fallback");
      }}
    >
      <Suspense fallback={fallback}>
        <Loaded colour={colour} glow={glow} onState={onState} url={url} />
      </Suspense>
    </Boundary>
  );
};
