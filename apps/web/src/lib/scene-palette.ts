import type { WorldPalette } from "@agent-native/game-three";

const readToken = (styles: CSSStyleDeclaration, name: string): string =>
  styles.getPropertyValue(name).trim();

export const readScenePalette = (): WorldPalette => {
  const styles = window.getComputedStyle(document.documentElement);

  return {
    background: readToken(styles, "--scene-void"),
    grid: readToken(styles, "--scene-grid"),
    gridMajor: readToken(styles, "--scene-grid-major"),
    keyLight: readToken(styles, "--scene-key-light"),
    local: readToken(styles, "--scene-local"),
    localEmissive: readToken(styles, "--scene-local-emissive"),
    remote: readToken(styles, "--scene-remote"),
    remoteEmissive: readToken(styles, "--scene-remote-emissive"),
  };
};
