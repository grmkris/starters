import { trait } from "koota";

/** Shared by both simulations. Declared once so a renderer or test that reads
 * the world sees one `Position`, whichever rules produced it. */
export const Player = trait({ clientId: "" });
export const Position = trait({ x: 0, y: 0.5, z: 0 });
export const Movement = trait({ x: 0, z: 0 });
