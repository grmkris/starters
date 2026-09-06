import type { DinoRaceManifest } from "@agent-native/domain";
import { racingLine } from "@agent-native/game-core";

import type { DinoRaceTelemetry } from "../lib/dinorace-replay";

const mapPoints = racingLine
  .filter((_, index) => index % 4 === 0)
  .map((point) => `${point.x},${-point.z}`)
  .join(" ");

export const DinoRaceTelemetryHud = ({
  telemetry,
  identity,
}: {
  readonly telemetry: DinoRaceTelemetry;
  readonly identity: DinoRaceManifest["identity"];
}) => {
  const { frame } = telemetry;
  const speed = Math.round(frame.speed * 3.6);
  const gear =
    speed === 0 ? "N" : String(Math.min(7, Math.floor(speed / 18) + 1));
  return (
    <>
      <section
        className="dino-driver"
        aria-label="Driver telemetry"
        data-racer={identity.species}
        style={telemetry.mode === "drive" ? { bottom: "190px" } : undefined}
      >
        <div className="dino-eyebrow">
          01 <span>/</span> {identity.name} / {identity.classification}
        </div>
        <h2
          style={telemetry.mode === "drive" ? { display: "none" } : undefined}
        >
          {identity.name}
          <span>DR-01 / {identity.classification}</span>
        </h2>
        <div className="dino-speed">
          <strong data-testid="race-speed">
            {String(speed).padStart(3, "0")}
          </strong>
          <span>KM/H</span>
          <div className="dino-gear">
            {gear}
            <small>GEAR</small>
          </div>
        </div>
        <div
          className="dino-rpm"
          style={telemetry.mode === "drive" ? { display: "none" } : undefined}
        >
          <i style={{ width: `${Math.min(100, 20 + speed * 0.65)}%` }} />
        </div>
        <dl
          className="dino-numbers"
          style={telemetry.mode === "drive" ? { display: "none" } : undefined}
        >
          <div>
            <dt>RPM</dt>
            <dd>
              {speed === 0
                ? "1,200"
                : (3500 + speed * 65).toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt>MASS / EST.</dt>
            <dd>
              {identity.massKg.toLocaleString("en-US")} <small>KG</small>
            </dd>
          </div>
          <div>
            <dt>ANGER</dt>
            <dd className="dino-anger">{Math.round(82 + speed * 0.12)}%</dd>
          </div>
        </dl>
      </section>
      <div className="dino-race-position">
        <span>
          {telemetry.mode === "drive"
            ? "TIME TRIAL / LAP"
            : "DEMONSTRATION LAP"}
        </span>
        <strong>
          {telemetry.mode === "drive"
            ? String(telemetry.lap).padStart(2, "0")
            : "01"}
          <i>{telemetry.mode === "drive" ? " / SOLO" : " / 01"}</i>
        </strong>
        <div className="dino-lap-progress">
          <i style={{ width: `${frame.positionAlongTrack * 100}%` }} />
        </div>
        <small>
          {telemetry.contact ? "BARRIER CONTACT" : frame.phase.toUpperCase()} ·{" "}
          {telemetry.elapsed.toFixed(1)} S
        </small>
        {telemetry.mode === "drive" && (
          <small style={{ display: "block" }} data-testid="race-lap-best">
            BEST{" "}
            {telemetry.bestLap === null
              ? "—"
              : `${telemetry.bestLap.toFixed(2)} S`}
          </small>
        )}
        {telemetry.mode === "drive" && (
          <svg
            className="[@media(max-height:500px)]:hidden"
            viewBox="-15 -75 110 130"
            aria-label="Circuit position"
            style={{ width: "100%", height: "100px", marginTop: "12px" }}
          >
            <title>Circuit position</title>
            <polyline
              points={mapPoints}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              opacity="0.4"
            />
            <circle cx={frame.x} cy={-frame.z} r="5" fill="var(--primary)" />
          </svg>
        )}
      </div>
    </>
  );
};
