import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group, MeshStandardMaterial } from "three";

import type { DuelSource } from "../duel-source";
import type { WorldPalette } from "../world-canvas";

/**
 * A hover tank seen from above: a wedge hull whose point is its front, a
 * turret with a barrel toward the seam, two thrusters behind. Built from
 * primitives so it exists before any model does; a `.glb` in the player slot
 * replaces it wholesale.
 *
 * Faces +x. Side 1 is turned by π so both tanks face the seam. It banks into
 * its slide along the lane, kicks back when it fires, and flashes when hit;
 * all three read the source and its events inside the frame loop, never
 * through React state.
 */

interface TankProps {
  readonly clientId: string;
  readonly isLocal: boolean;
  readonly palette: WorldPalette;
  readonly side: -1 | 1;
  readonly source: DuelSource;
}

const FOLLOW_STIFFNESS = 18;
/** Lean per unit of lane speed, capped. */
const BANK_PER_SPEED = 0.05;
const MAX_BANK = 0.3;
const RECOIL_DISTANCE = 0.12;
const RECOIL_SECONDS = 0.12;
const FLASH_SECONDS = 0.25;

export const Tank = ({
  clientId,
  isLocal,
  palette,
  side,
  source,
}: TankProps) => {
  const root = useRef<Group>(null);
  const hull = useRef<Group>(null);
  const body = useRef<MeshStandardMaterial>(null);
  const previousZ = useRef<number | null>(null);
  const recoil = useRef(0);
  const flash = useRef(0);

  useEffect(
    () =>
      source.subscribeEvents((event) => {
        if (event.kind === "fire" && event.ownerId === clientId) {
          recoil.current = 1;
        }
        if (event.kind === "hit" && event.clientId === clientId) {
          flash.current = 1;
        }
      }),
    [clientId, source]
  );

  useFrame((_state, delta) => {
    const group = root.current;
    const target = source.getPosition(clientId);
    if (!(group && target)) {
      return;
    }
    const blend = 1 - Math.exp(-FOLLOW_STIFFNESS * delta);
    group.position.x += (target.x - group.position.x) * blend;
    group.position.z += (target.z - group.position.z) * blend;
    group.position.y = 0;

    // Bank from the eased motion, so it settles as the tank does.
    const speed =
      previousZ.current === null || delta === 0
        ? 0
        : (group.position.z - previousZ.current) / delta;
    previousZ.current = group.position.z;
    const bank = Math.max(
      -MAX_BANK,
      Math.min(MAX_BANK, speed * BANK_PER_SPEED)
    );
    group.rotation.x = bank;

    recoil.current = Math.max(0, recoil.current - delta / RECOIL_SECONDS);
    flash.current = Math.max(0, flash.current - delta / FLASH_SECONDS);
    if (hull.current) {
      hull.current.position.x = -RECOIL_DISTANCE * recoil.current;
    }
    if (body.current) {
      body.current.emissiveIntensity = 0.35 + 1.6 * flash.current;
    }
  });

  const colour = isLocal ? palette.local : palette.remote;
  const glow = isLocal ? palette.localEmissive : palette.remoteEmissive;

  return (
    <group ref={root} rotation={[0, side === 1 ? Math.PI : 0, 0]}>
      <group ref={hull}>
        {/* Hull: a three-sided prism, one vertex forward. */}
        <mesh position={[0, 0.12, 0]} rotation={[0, Math.PI / 6, 0]}>
          <cylinderGeometry args={[0.44, 0.48, 0.24, 3]} />
          <meshStandardMaterial
            color={colour}
            emissive={glow}
            emissiveIntensity={0.35}
            flatShading
            metalness={0.25}
            ref={body}
            roughness={0.5}
          />
        </mesh>
        {/* Turret and barrel. */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.15, 0.17, 0.14, 8]} />
          <meshStandardMaterial
            color={colour}
            flatShading
            metalness={0.3}
            roughness={0.45}
          />
        </mesh>
        <mesh position={[0.3, 0.3, 0]}>
          <boxGeometry args={[0.4, 0.06, 0.06]} />
          <meshStandardMaterial color={colour} flatShading roughness={0.4} />
        </mesh>
        {/* Thrusters, lit in the player's colour. */}
        {[-0.18, 0.18].map((z) => (
          <mesh key={z} position={[-0.32, 0.1, z]}>
            <boxGeometry args={[0.14, 0.1, 0.12]} />
            <meshBasicMaterial color={colour} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
};
