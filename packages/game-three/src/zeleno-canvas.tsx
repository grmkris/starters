import {
  Environment,
  Lightformer,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ComponentRef, ReactNode } from "react";
import type { Group, Object3D } from "three";
import { MathUtils, Mesh, OrthographicCamera, Vector3 } from "three";

import { sampleZelenoPose } from "./zeleno-motion";

export interface ZelenoSource {
  readonly getTime: () => number;
}

export interface ZelenoPalette {
  readonly background: string;
  readonly night: string;
  readonly warm: string;
  readonly floor: string;
  readonly robot: string;
  readonly steel: string;
  readonly leaf: string;
  readonly tomato: string;
  readonly carrot: string;
}

type View = "perspective" | "front" | "top";
type Focus = "overview" | "produce" | "robot" | "pickup";

interface SceneProps {
  readonly source: ZelenoSource;
  readonly playing: boolean;
  readonly palette: ZelenoPalette;
  readonly cutaway: boolean;
  readonly evening: boolean;
  readonly reducedMotion: boolean;
  readonly focus: Focus;
  readonly view: View;
  readonly cameraReset: number;
  readonly onReady: () => void;
}

const ASSET = "/zeleno/container.glb";
const UP = new Vector3(0, 1, 0);
const smooth = (value: number) => MathUtils.smoothstep(value, 0, 1);

const Shop = ({ source, cutaway, onReady }: SceneProps) => {
  const { scene } = useGLTF(ASSET);
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
  const nodes = useRef<{
    shell: Object3D | undefined;
    roof: Object3D | undefined;
    hatch: Object3D | undefined;
    box: Object3D | undefined;
    packed: (Object3D | undefined)[];
    stock: (Object3D | undefined)[];
  } | null>(null);
  useEffect(() => {
    nodes.current = {
      shell: instance.getObjectByName("CutawayShell"),
      roof: instance.getObjectByName("Roof"),
      hatch: instance.getObjectByName("PickupHatch"),
      box: instance.getObjectByName("DeliveryBox"),
      packed: [0, 1, 2].map((i) => instance.getObjectByName(`Packed${i}`)),
      stock: [0, 1, 2].map((i) => instance.getObjectByName(`Stock${i}`)),
    };
    onReady();
  }, [instance, onReady]);
  useFrame(() => {
    const model = nodes.current;
    if (!model) {
      return;
    }
    const time = source.getTime();
    if (model.shell) {
      model.shell.visible = !cutaway;
    }
    if (model.roof) {
      model.roof.visible = !cutaway;
    }
    if (model.hatch) {
      model.hatch.position.y = smooth((time - 18) / 1.2) * 0.95;
    }
    if (model.box) {
      model.box.position.z = smooth((time - 19.2) / 2.5) * 1.6;
    }
    for (let i = 0; i < 3; i += 1) {
      const packed = model.packed[i];
      const stock = model.stock[i];
      if (packed) {
        packed.visible = time >= 6.35 + i * 4;
      }
      if (stock) {
        stock.visible = time < 4.35 + i * 4;
      }
    }
  });
  return <primitive dispose={null} object={instance} />;
};

const Joint = ({
  palette,
  radius = 0.125,
}: {
  readonly palette: ZelenoPalette;
  readonly radius?: number;
}) => (
  <group rotation={[0, 0, Math.PI / 2]}>
    <mesh castShadow>
      <cylinderGeometry args={[radius, radius, 0.25, 24]} />
      <meshStandardMaterial
        color={palette.steel}
        roughness={0.34}
        metalness={0.85}
      />
    </mesh>
    {[-1, 1].map((side) => (
      <mesh castShadow key={side} position={[0, side * 0.135, 0]}>
        <cylinderGeometry args={[radius * 0.74, radius * 0.74, 0.024, 24]} />
        <meshStandardMaterial color={palette.robot} roughness={0.35} />
      </mesh>
    ))}
  </group>
);

const Arm = ({
  palette,
  slim = false,
}: {
  readonly palette: ZelenoPalette;
  readonly slim?: boolean;
}) => (
  <>
    <mesh castShadow>
      <cylinderGeometry
        args={[slim ? 0.06 : 0.078, slim ? 0.08 : 0.1, 0.87, 20]}
      />
      <meshStandardMaterial color={palette.robot} roughness={0.36} />
    </mesh>
    <mesh castShadow position={[0, 0, slim ? 0.07 : 0.09]}>
      <boxGeometry args={[0.055, 0.62, 0.018]} />
      <meshStandardMaterial
        color={palette.steel}
        roughness={0.4}
        metalness={0.7}
      />
    </mesh>
    <mesh position={[slim ? 0.083 : 0.104, 0, 0]}>
      <cylinderGeometry args={[0.014, 0.014, 0.7, 8]} />
      <meshStandardMaterial color={palette.steel} roughness={0.8} />
    </mesh>
  </>
);

const alignLink = (
  link: Object3D,
  start: Vector3,
  end: Vector3,
  direction: Vector3
) => {
  link.position.copy(start).add(end).multiplyScalar(0.5);
  direction.subVectors(end, start);
  link.scale.y = direction.length();
  link.quaternion.setFromUnitVectors(UP, direction.normalize());
};

const Robot = ({
  source,
  palette,
  playing,
}: Pick<SceneProps, "source" | "palette" | "playing">) => {
  const { scene } = useGLTF(ASSET);
  const items = useMemo(
    () =>
      [0, 1, 2].map((i) => {
        const item = scene.getObjectByName(`Stock${i}`)?.clone(true);
        item?.position.set(0, 0, 0);
        item?.traverse((node) => {
          if (node instanceof Mesh) {
            node.castShadow = true;
          }
        });
        return item;
      }),
    [scene]
  );
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (playing) {
      invalidate();
    }
  }, [playing, invalidate]);
  const carriage = useRef<Group>(null);
  const upper = useRef<Group>(null);
  const lower = useRef<Group>(null);
  const elbowJoint = useRef<Group>(null);
  const gripper = useRef<Group>(null);
  const fingers = useRef<Group>(null);
  const held = useRef<Group>(null);
  const scratch = useMemo(
    () => ({
      shoulder: new Vector3(),
      elbow: new Vector3(),
      wrist: new Vector3(),
      direction: new Vector3(),
      pose: { x: 0, y: 0, z: 0, grip: 1, item: 0, carrying: false },
    }),
    []
  );
  useFrame(() => {
    if (playing) {
      invalidate();
    }
    if (
      !(
        carriage.current &&
        upper.current &&
        lower.current &&
        elbowJoint.current &&
        gripper.current &&
        fingers.current &&
        held.current
      )
    ) {
      return;
    }
    sampleZelenoPose(source.getTime(), scratch.pose);
    const { x, y, z, grip, item, carrying } = scratch.pose;
    carriage.current.position.x = x;
    scratch.shoulder.set(x, 2.13, 0.03);
    scratch.wrist.set(x, y, z);
    const dy = y - 2.13;
    const dz = z - 0.03;
    const distance = Math.max(0.001, Math.hypot(dy, dz));
    const bend = Math.sqrt(Math.max(0, 0.85 ** 2 - (distance / 2) ** 2));
    scratch.elbow.set(
      x,
      (2.13 + y) / 2 + (dz / distance) * bend,
      (0.03 + z) / 2 - (dy / distance) * bend
    );
    alignLink(
      upper.current,
      scratch.shoulder,
      scratch.elbow,
      scratch.direction
    );
    alignLink(lower.current, scratch.elbow, scratch.wrist, scratch.direction);
    elbowJoint.current.position.copy(scratch.elbow);
    gripper.current.position.copy(scratch.wrist);
    fingers.current.scale.set(grip, 1, grip);
    held.current.visible = carrying;
    for (const [i, vegetable] of items.entries()) {
      if (vegetable) {
        vegetable.visible = i === item;
      }
    }
  });
  return (
    <group name="RailRobot">
      <group name="RobotCarriage" ref={carriage}>
        <mesh castShadow position={[0, 2.23, 0.03]}>
          <boxGeometry args={[0.46, 0.18, 0.49]} />
          <meshStandardMaterial color={palette.robot} roughness={0.36} />
        </mesh>
        <mesh castShadow position={[0, 2.33, 0.03]}>
          <boxGeometry args={[0.37, 0.04, 0.54]} />
          <meshStandardMaterial
            color={palette.steel}
            metalness={0.85}
            roughness={0.3}
          />
        </mesh>
        {[-0.18, 0.18].map((x) => (
          <mesh
            castShadow
            key={x}
            position={[x, 2.285, 0.03]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.045, 0.045, 0.56, 16]} />
            <meshStandardMaterial
              color={palette.steel}
              roughness={0.4}
              metalness={0.85}
            />
          </mesh>
        ))}
        <mesh position={[0.235, 2.23, 0.03]}>
          <boxGeometry args={[0.01, 0.065, 0.14]} />
          <meshStandardMaterial
            color={palette.leaf}
            emissive={palette.leaf}
            emissiveIntensity={0.5}
          />
        </mesh>
        <group position={[0, 2.13, 0.03]}>
          <Joint palette={palette} />
        </group>
      </group>
      <group ref={upper}>
        <Arm palette={palette} />
      </group>
      <group ref={lower}>
        <Arm palette={palette} slim />
      </group>
      <group ref={elbowJoint}>
        <Joint palette={palette} />
      </group>
      <group name="RobotGripper" ref={gripper}>
        <mesh castShadow>
          <cylinderGeometry args={[0.075, 0.106, 0.11, 24]} />
          <meshStandardMaterial
            color={palette.steel}
            metalness={0.85}
            roughness={0.3}
          />
        </mesh>
        <mesh castShadow position={[0, -0.047, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.035, 24]} />
          <meshStandardMaterial color={palette.robot} roughness={0.4} />
        </mesh>
        <group ref={fingers}>
          {[0, 1, 2].map((i) => (
            <group key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
              <mesh
                castShadow
                position={[0.11, -0.115, 0]}
                rotation={[0, 0, -0.2]}
              >
                <capsuleGeometry args={[0.023, 0.09, 4, 10]} />
                <meshStandardMaterial color={palette.steel} roughness={0.5} />
              </mesh>
              <mesh
                castShadow
                position={[0.094, -0.185, 0]}
                rotation={[0, 0, -0.5]}
              >
                <capsuleGeometry args={[0.024, 0.045, 4, 10]} />
                <meshStandardMaterial color={palette.leaf} roughness={0.9} />
              </mesh>
            </group>
          ))}
        </group>
        <group name="CarriedProduce" position={[0, -0.18, 0]} ref={held}>
          {items.map((item, i) =>
            item ? <primitive dispose={null} key={i} object={item} /> : null
          )}
        </group>
      </group>
    </group>
  );
};

const CAMERA_DETAILS = {
  overview: {
    position: [6.5, 7.5, 10],
    target: [0, 1, 0.35],
    width: 10.5,
    height: 6.8,
  },
  produce: {
    position: [1.8, 3.5, 6],
    target: [-1.2, 1.1, -0.65],
    width: 6,
    height: 3.8,
  },
  robot: {
    position: [3.8, 3.3, 6],
    target: [-0.55, 1.9, 0.08],
    width: 4.6,
    height: 3.1,
  },
  pickup: {
    position: [6, 3.8, 7],
    target: [2.04, 1.15, 0.7],
    width: 4,
    height: 3.5,
  },
} as const;

const CameraRig = ({
  view,
  focus,
  reducedMotion,
  cameraReset,
}: Pick<SceneProps, "view" | "focus" | "reducedMotion" | "cameraReset">) => {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const get = useThree((state) => state.get);
  const size = useThree((state) => state.size);
  const goalRef = useRef({
    position: new Vector3(),
    target: new Vector3(),
    zoom: 65,
    moving: false,
    initialized: false,
    revision: cameraReset,
  });
  useEffect(() => {
    const goal = goalRef.current;
    const reset = goal.revision !== cameraReset;
    goal.revision = cameraReset;
    const { camera, invalidate } = get();
    if (!(camera instanceof OrthographicCamera)) {
      return;
    }
    const detail = CAMERA_DETAILS[focus];
    goal.position.fromArray(detail.position);
    goal.target.fromArray(detail.target);
    goal.zoom = Math.min(
      size.width / detail.width,
      size.height / detail.height
    );
    if (view === "top") {
      goal.position.set(0, 12, 0.01);
    }
    if (view === "front") {
      goal.position.set(0, 2.7, 12);
    }
    if (reducedMotion || !goal.initialized || reset) {
      camera.position.copy(goal.position);
      camera.zoom = goal.zoom;
      camera.updateProjectionMatrix();
      controls.current?.target.copy(goal.target);
      controls.current?.update();
      goal.moving = false;
    } else {
      goal.moving = true;
    }
    goal.initialized = true;
    invalidate();
  }, [cameraReset, focus, get, reducedMotion, size, view]);
  useFrame(({ camera, invalidate }, delta) => {
    const goal = goalRef.current;
    if (
      !(goal.moving && controls.current && camera instanceof OrthographicCamera)
    ) {
      return;
    }
    const alpha = 1 - Math.exp(-7 * Math.min(delta, 0.1));
    camera.position.lerp(goal.position, alpha);
    controls.current.target.lerp(goal.target, alpha);
    camera.zoom = MathUtils.lerp(camera.zoom, goal.zoom, alpha);
    if (
      camera.position.distanceToSquared(goal.position) < 0.00001 &&
      Math.abs(camera.zoom - goal.zoom) < 0.005
    ) {
      camera.position.copy(goal.position);
      camera.zoom = goal.zoom;
      controls.current.target.copy(goal.target);
      goal.moving = false;
    }
    camera.updateProjectionMatrix();
    controls.current.update();
    invalidate();
  });
  return (
    <OrbitControls
      enableDamping={false}
      enablePan={false}
      makeDefault
      maxPolarAngle={Math.PI / 2.03}
      maxZoom={220}
      minZoom={20}
      onStart={() => {
        goalRef.current.moving = false;
      }}
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
      <color
        args={[props.evening ? props.palette.night : props.palette.background]}
        attach="background"
      />
      <hemisphereLight
        args={[
          props.palette.background,
          props.palette.floor,
          props.evening ? 0.6 : 1.65,
        ]}
      />
      <directionalLight
        castShadow
        color={props.evening ? props.palette.background : props.palette.warm}
        intensity={props.evening ? 0.8 : 2.4}
        position={[-3, 8, 5]}
        shadow-bias={-0.0002}
        shadow-camera-bottom={-5}
        shadow-camera-far={25}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={5}
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.018}
      />
      <directionalLight
        intensity={props.evening ? 0.5 : 1}
        position={[4, 4, -2]}
      />
      <Environment
        frames={1}
        resolution={64}
        environmentIntensity={props.evening ? 0.3 : 0.6}
      >
        <Lightformer
          position={[0, 5, -3]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[10, 10, 1]}
          intensity={2}
        />
        <Lightformer
          position={[-5, 3, 2]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[5, 5, 1]}
          intensity={2}
        />
      </Environment>
      {[-1.8, 0.4, 2.05].map((x) => (
        <pointLight
          color={props.palette.warm}
          decay={2}
          distance={4}
          intensity={props.evening ? 5 : 0.3}
          key={x}
          position={[x, 2.15, -0.55]}
        />
      ))}
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
        <meshStandardMaterial
          color={props.evening ? props.palette.night : props.palette.background}
          roughness={1}
        />
      </mesh>
      <CameraRig
        cameraReset={props.cameraReset}
        focus={props.focus}
        reducedMotion={props.reducedMotion}
        view={props.view}
      />
    </Canvas>
  </SceneBoundary>
);
