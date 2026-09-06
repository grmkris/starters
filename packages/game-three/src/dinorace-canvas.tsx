import { Html, Line, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  BoxHelper,
  Group,
  Mesh,
  PCFShadowMap,
  MeshStandardMaterial,
  Vector3,
} from "three";
import type { Material, Object3D } from "three";
import { VertexNormalsHelper } from "three/addons/helpers/VertexNormalsHelper.js";

import type {
  DinoRaceAsset,
  DinoRaceCamera,
  DinoRaceDebug,
  DinoRaceInspection,
  DinoRaceMetrics,
  DinoRacePalette,
  DinoRaceQuality,
  DinoRaceSource,
} from "./dinorace-source";
import { DinoRaceTrack } from "./dinorace-track";

interface CanvasProps {
  readonly assetUrl: string;
  readonly asset: DinoRaceAsset;
  readonly source: DinoRaceSource;
  readonly camera: DinoRaceCamera;
  readonly debug: DinoRaceDebug;
  readonly engineering: boolean;
  readonly inspection: DinoRaceInspection;
  readonly quality: DinoRaceQuality;
  readonly palette: DinoRacePalette;
  readonly metrics: DinoRaceMetrics;
  readonly onReady: (names: readonly string[]) => void;
  readonly onError: (message: string) => void;
  readonly onInspect: () => void;
}

// Preserve Three's declared material type after runtime Mesh narrowing.
const isMesh = (object: Object3D): object is Mesh => object instanceof Mesh;
const meshMaterials = (mesh: Mesh): readonly Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

const setObjectVisibility = (object: Object3D, visible: boolean): void => {
  object.visible = visible;
};

const Asset = ({
  assetUrl,
  asset,
  source,
  debug,
  inspection,
  onReady,
}: CanvasProps) => {
  const gltf = useGLTF(assetUrl);
  const root = useRef<Group>(null);
  const model = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.traverse((obj) => {
      if (isMesh(obj)) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        // A material array requires geometry groups; preserve single-material meshes.
        obj.material = Array.isArray(obj.material)
          ? obj.material.map((material) => material.clone())
          : obj.material.clone();
      }
    });
    return scene;
  }, [gltf.scene]);
  const driver = useMemo(
    () => model.getObjectByName(asset.objects.driver),
    [model, asset]
  );
  const car = useMemo(
    () => model.getObjectByName(asset.objects.car),
    [model, asset]
  );
  const wheels = useMemo(
    () => asset.objects.wheels.map((name) => model.getObjectByName(name)),
    [model, asset]
  );
  useEffect(() => {
    if (!(car && driver) || wheels.some((wheel) => wheel === undefined)) {
      throw new Error("GLB named nodes do not match the validated manifest");
    }
    const names: string[] = [];
    model.traverse((obj) => {
      if (obj.name) {
        names.push(obj.name);
      }
    });
    onReady(names);
    return () => {
      model.traverse((obj) => {
        if (isMesh(obj)) {
          const materials = meshMaterials(obj);
          for (const material of materials) {
            material.dispose();
          }
        }
      });
    };
  }, [model, car, driver, wheels, onReady]);
  useEffect(() => {
    if (driver) {
      setObjectVisibility(driver, inspection !== "vehicle");
    }
    if (car) {
      setObjectVisibility(car, inspection !== "driver");
    }
    model.traverse((obj) => {
      if (isMesh(obj)) {
        for (const material of meshMaterials(obj)) {
          if (material instanceof MeshStandardMaterial) {
            material.wireframe = debug.wireframe;
          }
        }
      }
    });
    for (const name of asset.objects.colliders) {
      const collider = model.getObjectByName(name);
      if (collider) {
        collider.visible = debug.colliders;
        if (
          collider instanceof Mesh &&
          collider.material instanceof MeshStandardMaterial
        ) {
          collider.material.wireframe = true;
          collider.material.color.set("#ff8056");
        }
      }
    }
  }, [asset, car, debug.colliders, debug.wireframe, driver, inspection, model]);
  const helpers = useMemo(() => {
    const group = new Group();
    if (debug.bounds) {
      for (const node of [car, driver]) {
        if (node) {
          group.add(new BoxHelper(node, "#76e5ff"));
        }
      }
    }
    if (debug.normals) {
      model.traverse((obj) => {
        if (isMesh(obj) && obj.name.includes("SKULL")) {
          group.add(new VertexNormalsHelper(obj, 0.14, 0xfa_ca_79));
        }
      });
    }
    return group;
  }, [car, driver, model, debug.bounds, debug.normals]);
  useEffect(
    () => () => {
      helpers.traverse((obj) => {
        if (obj instanceof BoxHelper || obj instanceof VertexNormalsHelper) {
          obj.dispose();
        }
      });
    },
    [helpers]
  );
  useFrame(() => {
    const frame = source.getFrame();
    if (root.current) {
      root.current.position.set(frame.x, 0, frame.z);
      root.current.rotation.y = frame.heading;
    }
    for (const wheel of wheels) {
      if (wheel) {
        wheel.rotation.set(
          frame.wheelRotation,
          wheel.name.includes("_F") ? frame.steeringAmount : 0,
          0,
          "YXZ"
        );
      }
    }
    root.current?.updateWorldMatrix(true, true);
    for (const helper of helpers.children) {
      if (
        helper instanceof BoxHelper ||
        helper instanceof VertexNormalsHelper
      ) {
        helper.update();
      }
    }
  });
  return (
    <>
      <primitive object={helpers} />
      <group ref={root}>
        <primitive object={model} dispose={null} />
        {debug.labels && (
          <>
            <Html position={[...asset.anchors.head]} center>
              <span
                style={{
                  background: "var(--background)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                  padding: "4px 7px",
                  font: "9px monospace",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                {asset.objects.driver}
              </span>
            </Html>
            <Html position={[0, 0.8, 2.2]} center>
              <span
                style={{
                  background: "var(--background)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                  padding: "4px 7px",
                  font: "9px monospace",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                {asset.objects.car}
              </span>
            </Html>
          </>
        )}
        <mesh
          position={[0, 0.012, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[2.2, 3.7, 1]}
        >
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial
            color="#000000"
            transparent
            opacity={0.16}
            depthWrite={false}
          />
        </mesh>
        {debug.rig && (
          <Line
            points={[
              [...asset.anchors.tail],
              [...asset.anchors.hip],
              [...asset.anchors.head],
            ]}
            color="#f7cb73"
            lineWidth={3}
          />
        )}
        {debug.rig &&
          [asset.anchors.tail, asset.anchors.hip, asset.anchors.head].map(
            (point, index) => (
              <mesh key={index} position={[...point]}>
                <sphereGeometry args={[0.12, 12, 8]} />
                <meshBasicMaterial color="#f7cb73" depthTest={false} />
              </mesh>
            )
          )}
      </group>
    </>
  );
};

const cameraWaypoints: [number, number, number][] = [
  [6.2, 2.8, 12],
  [6.2, 3.6, 10],
  [1, 4.7, 11],
  [-9, 3.8, 8],
  [-10, 3, -5],
];

const CameraRig = ({
  source,
  camera: mode,
  metrics,
  inspection,
  asset,
}: CanvasProps) => {
  const look = useMemo(() => new Vector3(0, 2, 0), []);
  const desired = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);
  const local = useMemo(() => new Vector3(), []);
  const frames = useRef({ time: 0, count: 0 });
  useFrame(({ camera, gl }, delta) => {
    frames.current.count += 1;
    frames.current.time += delta;
    if (frames.current.time > 0.5) {
      Object.assign(metrics, {
        fps: Math.round(frames.current.count / frames.current.time),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      });
      frames.current.count = 0;
      frames.current.time = 0;
    }
    gl.info.reset();
    if (mode === "orbit") {
      return;
    }
    const frame = source.getFrame();
    target.set(
      frame.x,
      inspection === "vehicle" ? 0.8 : asset.anchors.cameraTarget[1],
      frame.z
    );
    const intro = source.getIntroTime();
    if (mode === "chase") {
      local.set(0, 9, -17);
      target.set(
        frame.x + Math.sin(frame.heading) * 8,
        1.2,
        frame.z + Math.cos(frame.heading) * 8
      );
    } else if (mode === "trackside") {
      local.set(12, 3, 14);
    } else {
      const phase = Math.min(3.999, Math.max(0, intro - 2) / 3.5);
      const index = Math.floor(phase);
      const a = cameraWaypoints[index];
      const b = cameraWaypoints[index + 1];
      if (a && b) {
        local.fromArray(a).lerp(desired.fromArray(b), phase - index);
      }
    }
    if (mode === "trackside") {
      desired.set(12, 3, 18);
    } else {
      const sin = Math.sin(frame.heading);
      const cos = Math.cos(frame.heading);
      desired.set(
        frame.x + local.x * cos + local.z * sin,
        local.y,
        frame.z - local.x * sin + local.z * cos
      );
    }
    camera.position.lerp(desired, 1 - Math.exp(-3 * delta));
    look.lerp(target, 1 - Math.exp(-5 * delta));
    camera.lookAt(look);
  });
  return null;
};

class SceneBoundary extends Component<
  { readonly children: ReactNode; readonly onError: (message: string) => void },
  { readonly failed: boolean }
> {
  constructor(props: {
    readonly children: ReactNode;
    readonly onError: (message: string) => void;
  }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error): void {
    this.props.onError(error.message);
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export const DinoRaceCanvas = (props: CanvasProps) => {
  const [softwareRenderer, setSoftwareRenderer] = useState(true);
  const low =
    props.quality === "low" ||
    (props.quality === "auto" &&
      typeof window !== "undefined" &&
      (softwareRenderer ||
        window.matchMedia("(max-width: 700px), (pointer: coarse)").matches));
  const insane = props.quality === "insane";
  const path = useMemo(
    () =>
      props.source.track.map(
        (point) => [point.x, 0.1, point.z] satisfies [number, number, number]
      ),
    [props.source]
  );
  const target = props.source.getFrame();
  return (
    <SceneBoundary onError={props.onError}>
      <Canvas
        camera={{ fov: 43, near: 0.1, far: 450, position: [6.2, 2.8, 12] }}
        dpr={low ? 1 : [1, insane ? 2 : 1.5]}
        shadows={low ? false : { type: PCFShadowMap }}
        gl={{ antialias: !low, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1;
          gl.info.autoReset = false;
          const context = gl.getContext();
          const extension = context.getExtension("WEBGL_debug_renderer_info");
          const renderer = extension
            ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
            : "software";
          setSoftwareRenderer(/swiftshader|llvmpipe|software/iu.test(renderer));
          gl.domElement.addEventListener(
            "webglcontextlost",
            (event) => {
              event.preventDefault();
              props.onError("WebGL context lost. Reduce quality and retry.");
            },
            { once: true }
          );
        }}
      >
        <DinoRaceTrack
          source={props.source}
          low={low}
          insane={insane}
          engineering={props.engineering}
          showLights={props.debug.lights}
          palette={props.palette}
        />
        <Suspense fallback={null}>
          <Asset {...props} />
        </Suspense>
        <CameraRig {...props} />
        {props.debug.racingLine && (
          <Line points={path} color="#74e6fb" lineWidth={2} />
        )}
        {props.debug.cameraLine && (
          <Line points={cameraWaypoints} color="#ffbb63" lineWidth={2} dashed />
        )}
        {props.debug.lights && (
          <>
            <axesHelper args={[12]} />
            <gridHelper args={[150, 30, "#93d7fa", "#254555"]} />
          </>
        )}
        <OrbitControls
          enabled={props.camera === "orbit"}
          enableDamping
          minDistance={4}
          maxDistance={35}
          maxPolarAngle={Math.PI / 2.03}
          target={[
            target.x,
            props.inspection === "vehicle" ? 0.8 : 2,
            target.z,
          ]}
          onStart={props.onInspect}
        />
      </Canvas>
    </SceneBoundary>
  );
};
