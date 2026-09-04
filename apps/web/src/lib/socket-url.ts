/**
 * Where the realtime socket lives.
 *
 * Same origin as the page by default. In production the app and the socket sit
 * behind one origin with a reverse proxy routing `/realtime` to the server, and
 * the Vite dev server replicates that topology with `server.proxy`. Dev and
 * production therefore run identical client code, and any device that can reach
 * the page can reach the socket with no configuration - which is what makes a
 * phone on the same network work at all.
 *
 * The `wss:` branch is not cosmetic. A page served over HTTPS may not open an
 * insecure `ws:` connection, and an HTTPS dev URL is exactly what a tool like
 * portless produces.
 *
 * `VITE_WS_URL` overrides all of it for the genuine exception: a server on a
 * different origin from the page.
 */
export const realtimeUrl = (): string => {
  const override = import.meta.env.VITE_WS_URL;
  if (override !== undefined && override !== "") {
    return override;
  }

  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/realtime`;
};
