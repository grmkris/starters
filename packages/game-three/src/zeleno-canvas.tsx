import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ComponentRef, ReactNode } from "react";
import type { Group } from "three";
import { MathUtils, Mesh, OrthographicCamera, Vector3 } from "three";

export interface ZelenoSource {
  readonly getTime: () => number;
}

export interface ZelenoPalette {
  readonly background: string;
  readonly floor: string;
  readonly robot: string;
  readonly steel: string;
  readonly leaf: string;
  readonly tomato: string;
  readonly carrot: string;
}

type View = "perspective" | "front" | "top";

interface SceneProps {
  readonly source: ZelenoSource;
  readonly playing: boolean;
  readonly palette: ZelenoPalette;
  readonly cutaway: boolean;
  readonly view: View;
  readonly cameraReset: number;
  readonly onReady: () => void;
}

const ASSET = "/zeleno/container.glb";
const UP = new Vector3(0, 1, 0);
const smooth = (value: number) => MathUtils.smoothstep(value, 0, 1);

const Shop = ({ source, cutaway, onReady }: SceneProps) => {
  const { scene } = useGLTF(ASSET);
  const root = useRef<Group>(null);
  const instance = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);
  useEffect(onReady, [onReady]);
  useFrame(() => {
    const time = source.getTime();
    const shell = root.current?.getObjectByName("CutawayShell");
    const roof = root.current?.getObjectByName("Roof");
    const hatch = root.current?.getObjectByName("PickupHatch");
    const box = root.current?.getObjectByName("DeliveryBox");
    if (shell) {
      shell.visible = !cutaway;
    }
    if (roof) {
      roof.visible = !cutaway;
    }
    if (hatch) {
      hatch.position.y = smooth((time - 18) / 1.2) * 0.95;
    }
    if (box) {
      box.position.z = smooth((time - 19.2) / 2.5) * 1.6;
    }
    for (let i = 0; i < 3; i += 1) {
      const item = root.current?.getObjectByName(`Packed${i}`);
      if (item) {
        item.visible = time >= 3 + i * 4 + 3.35;
      }
    }
  });
  return <primitive dispose={null} object={instance} ref={root} />;
};

const Robot = ({
  source,
  palette,
  playing,
}: Pick<SceneProps, "source" | "palette" | "playing">) => {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (playing) {
      invalidate();
    }
  }, [playing, invalidate]);
  useFrame(() => {
    if (playing) {
      invalidate();
    }
  });
  const carriage = useRef<Group>(null);
  const upper = useRef<Mesh>(null);
  const lower = useRef<Mesh>(null);
  const elbowJoint = useRef<Mesh>(null);
  const gripper = useRef<Group>(null);
  const fingers = useRef<Group>(null);
  const held = useRef<Group>(null);
  const vegetables = useRef<Group>(null);
  const points = useMemo(
    () => ({
      shoulder: new Vector3(),
      elbow: new Vector3(),
      wrist: new Vector3(),
      direction: new Vector3(),
    }),
    []
  );

  useFrame(() => {
    if (
      !(
        carriage.current &&
        upper.current &&
        lower.current &&
        elbowJoint.current &&
        gripper.current &&
        fingers.current &&
        held.current &&
        vegetables.current
      )
    ) {
      return;
    }
    const time = source.getTime();
    let x = -0.6;
    let y = 1.2;
    let z = -0.1;
    let carrying = false;
    let vegetable = 0;
    if (time >= 3 && time < 15) {
      vegetable = Math.min(2, Math.floor((time - 3) / 4));
      const t = (time - 3) % 4;
      const targetX = -2.29 + vegetable * 0.97;
      const fromX = vegetable === 0 ? -0.6 : 2.07;
      if (t < 1) {
        x = MathUtils.lerp(fromX, targetX, smooth(t));
        y = MathUtils.lerp(1.2, 1.55, smooth(t));
        z = MathUtils.lerp(-0.1, -0.79, smooth(t));
      } else if (t < 1.7) {
        x = targetX;
        y = 1.55 - Math.sin(((t - 1) / 0.7) * Math.PI) * 0.18;
        z = -0.79;
        carrying = t > 1.35;
      } else if (t < 3) {
        const travel = smooth((t - 1.7) / 1.3);
        x = MathUtils.lerp(targetX, 2.07, travel);
        y = 1.55 + Math.sin(travel * Math.PI) * 0.23;
        z = MathUtils.lerp(-0.79, 0.25, travel);
        carrying = true;
      } else {
        x = 2.07;
        y = 1.55 - Math.sin((t - 3) * Math.PI) * 0.28;
        z = 0.25;
        carrying = t < 3.35;
      }
    } else if (time >= 15) {
      const home = smooth((time - 15) / 2);
      x = MathUtils.lerp(2.07, -0.6, home);
      z = MathUtils.lerp(0.25, -0.1, home);
      y = MathUtils.lerp(1.55, 1.2, home);
    }
    carriage.current.position.x = x;
    points.shoulder.set(x, 2.13, 0.03);
    points.wrist.set(x, y, z);
    const dy = y - 2.13;
    const dz = z - 0.03;
    const distance = Math.hypot(dy, dz);
    const bend = Math.sqrt(Math.max(0, 0.85 ** 2 - (distance / 2) ** 2));
    points.elbow.set(
      x,
      (2.13 + y) / 2 + (dz / distance) * bend,
      (0.03 + z) / 2 - (dy / distance) * bend
    );
    for (const [link, a, b] of [
      [upper.current, points.shoulder, points.elbow],
      [lower.current, points.elbow, points.wrist],
    ] as const) {
      link.position.copy(a).add(b).multiplyScalar(0.5);
      points.direction.subVectors(b, a);
      link.scale.y = points.direction.length();
      link.quaternion.setFromUnitVectors(UP, points.direction.normalize());
    }
    elbowJoint.current.position.copy(points.elbow);
    gripper.current.position.copy(points.wrist);
    fingers.current.scale.x = carrying ? 0.72 : 1;
    fingers.current.scale.z = carrying ? 0.72 : 1;
    held.current.visible = carrying;
    for (const [i, item] of vegetables.current.children.entries()) {
      item.visible = i === vegetable;
    }
  });

  return (
    <group name="RailRobot">
      <group ref={carriage}>
        <mesh castShadow position={[0, 2.23, 0.03]}>
          <boxGeometry args={[0.46, 0.18, 0.49]} />
          <meshStandardMaterial color={palette.robot} roughness={0.4} />
        </mesh>
        <mesh
          castShadow
          position={[0, 2.1, 0.03]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.125, 0.125, 0.25, 16]} />
          <meshStandardMaterial color={palette.steel} />
        </mesh>
      </group>
      <mesh castShadow ref={upper}>
        <cylinderGeometry args={[0.085, 0.11, 1, 12]} />
        <meshStandardMaterial color={palette.robot} roughness={0.4} />
      </mesh>
      <mesh castShadow ref={lower}>
        <cylinderGeometry args={[0.065, 0.085, 1, 12]} />
        <meshStandardMaterial color={palette.robot} roughness={0.4} />
      </mesh>
      <mesh castShadow ref={elbowJoint} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.23, 16]} />
        <meshStandardMaterial color={palette.steel} />
      </mesh>
      <group ref={gripper}>
        <mesh castShadow>
          <cylinderGeometry args={[0.095, 0.11, 0.12, 16]} />
          <meshStandardMaterial color={palette.steel} />
        </mesh>
        <group ref={fingers}>
          {[0, 1, 2].map((i) => (
            <mesh
              castShadow
              key={i}
              position={[
                Math.cos((i * Math.PI * 2) / 3) * 0.105,
                -0.12,
                Math.sin((i * Math.PI * 2) / 3) * 0.105,
              ]}
            >
              <capsuleGeometry args={[0.025, 0.14, 4, 8]} />
              <meshStandardMaterial color={palette.steel} />
            </mesh>
          ))}
        </group>
        <group position={[0, -0.18, 0]} ref={held}>
          <group ref={vegetables}>
            <mesh castShadow scale={[1, 0.85, 1]}>
              <sphereGeometry args={[0.095, 12, 8]} />
              <meshStandardMaterial color={palette.tomato} />
            </mesh>
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.055, 0.29, 12]} />
              <meshStandardMaterial color={palette.carrot} />
            </mesh>
            <mesh castShadow>
              <icosahedronGeometry args={[0.135, 1]} />
              <meshStandardMaterial color={palette.leaf} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};

const CameraRig = ({ view }: Pick<SceneProps, "view">) => {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const get = useThree((state) => state.get);
  const size = useThree((state) => state.size);
  useEffect(() => {
    const { camera } = get();
    if (!(camera instanceof OrthographicCamera)) {
      return;
    }
    camera.zoom = Math.min(size.width / 10.5, size.height / 6.8);
    camera.updateProjectionMatrix();
    let position: [number, number, number] = [6.5, 7.5, 10];
    if (view === "top") {
      position = [0, 12, 0.01];
    }
    if (view === "front") {
      position = [0, 3, 12];
    }
    camera.position.set(...position);
    controls.current?.target.set(0, 1, 0.35);
    controls.current?.update();
  }, [get, size, view]);
  return (
    <OrbitControls
      enableDamping={false}
      enablePan={false}
      makeDefault
      maxPolarAngle={Math.PI / 2.03}
      maxZoom={180}
      minZoom={25}
      ref={controls}
      target={[0, 1, 0.35]}
    />
  );
};

interface BoundaryProps {
  readonly children: ReactNode;
  readonly onError: () => void;
}

class SceneBoundary extends Component<BoundaryProps, { failed: boolean }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export const ZelenoCanvas = (
  props: SceneProps & { readonly onError: () => void }
) => (
  <SceneBoundary onError={props.onError}>
    <Canvas
      camera={{ position: [7.5, 6.2, 10], zoom: 65, near: 0.1, far: 60 }}
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      orthographic
      shadows="percentage"
    >
      <color args={[props.palette.background]} attach="background" />
      <hemisphereLight
        args={[props.palette.background, props.palette.floor, 2.5]}
      />
      <directionalLight
        castShadow
        intensity={3}
        position={[-3, 8, 5]}
        shadow-bias={-0.0002}
        shadow-camera-bottom={-5}
        shadow-camera-far={25}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={5}
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.025}
      />
      <directionalLight intensity={1.5} position={[4, 4, -2]} />
      <Suspense fallback={null}>
        <Shop {...props} />
        <Robot
          palette={props.palette}
          playing={props.playing}
          source={props.source}
        />
      </Suspense>
      <mesh
        position={[0, -0.285, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={props.palette.background} roughness={1} />
      </mesh>
      <CameraRig key={props.cameraReset} view={props.view} />
    </Canvas>
  </SceneBoundary>
);
