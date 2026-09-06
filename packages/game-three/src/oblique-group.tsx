import { useMemo } from "react";
import type { ReactNode } from "react";

import { obliqueShear } from "./oblique";
import type { ObliqueAxis } from "./oblique";

/** The lean of the lane's contents: how far up the screen a unit of height goes. */
export const OBLIQUE_K = 0.35;

interface ObliqueGroupProps {
  readonly axis?: ObliqueAxis;
  readonly children: ReactNode;
  readonly k?: number;
}

/** Everything inside leans up the screen by its height; the ground does not move. */
export const ObliqueGroup = ({
  axis = "z",
  children,
  k = OBLIQUE_K,
}: ObliqueGroupProps) => {
  const matrix = useMemo(() => obliqueShear(k, axis), [axis, k]);
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      {children}
    </group>
  );
};
