import { ZelenoCanvas } from "@agent-native/game-three";
import type { ZelenoPalette } from "@agent-native/game-three";
import { Badge } from "@agent-native/ui/components/badge";
import { Button } from "@agent-native/ui/components/button";
import { Separator } from "@agent-native/ui/components/separator";
import { Switch } from "@agent-native/ui/components/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@agent-native/ui/components/toggle-group";
import {
  ArrowDown,
  ArrowUpRight,
  Box,
  Check,
  CirclePause,
  CreditCard,
  Cuboid,
  Leaf,
  Maximize,
  Mic,
  MoveUpRight,
  PackageCheck,
  Play,
  RotateCcw,
  Sprout,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";

import { useZelenoDemo } from "../hooks/use-zeleno-demo";

const readPalette = (): ZelenoPalette => {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) =>
    styles.getPropertyValue(`--zeleno-${name}`).trim();
  return {
    background: token("scene"),
    floor: token("floor"),
    robot: token("robot"),
    steel: token("steel"),
    leaf: token("leaf"),
    tomato: token("tomato"),
    carrot: token("carrot"),
  };
};

const steps = [
  {
    name: "Poveš, kaj želiš.",
    note: "Glasovni pomočnik sestavi naročilo.",
    icon: Mic,
  },
  {
    name: "Robot nabere.",
    note: "Po tirnici do sveže zelenjave.",
    icon: MoveUpRight,
  },
  {
    name: "Vse gre v škatlo.",
    note: "Nežno odlaganje na pakirnem mestu.",
    icon: Box,
  },
  {
    name: "Potrdiš in plačaš.",
    note: "Prevzemno okno ostane zaprto do plačila.",
    icon: CreditCard,
  },
  {
    name: "Sveže je tvoje.",
    note: "Okno se odpre in škatla pripelje do tebe.",
    icon: PackageCheck,
  },
];

const statusCopy = {
  idle: "Pripravljen na prvo naročilo",
  ordering: "»En paradižnik, korenček in solato, prosim.«",
  picking: "Robot pobira zelenjavo s polic.",
  packing: "Tvoja škatla je pripravljena.",
  payment: "Škatla čaka. Potrdi demo plačilo za prevzem.",
  delivery: "Plačilo potrjeno. Odpiramo prevzemno okno.",
  complete: "Dober tek! Tvoja škatla je na prevzemnem mestu.",
};

export const ZelenoPage = () => {
  const palette = useMemo(() => readPalette(), []);
  const [cutaway, setCutaway] = useState(true);
  const [view, setView] = useState<"perspective" | "front" | "top">(
    "perspective"
  );
  const [cameraReset, setCameraReset] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;
  const demo = useZelenoDemo(reducedMotion);
  const onReady = useCallback(() => {
    setReady(true);
  }, []);
  const onError = useCallback(() => {
    setFailed(true);
  }, []);
  const activeStep = {
    idle: -1,
    ordering: 0,
    picking: 1,
    packing: 2,
    payment: 3,
    delivery: 4,
    complete: 4,
  }[demo.stage];

  const playback = () => {
    if (demo.running) {
      demo.pause();
    } else if (demo.stage === "payment") {
      demo.pay();
    } else {
      if (demo.stage === "complete") {
        demo.reset();
      }
      demo.play();
    }
  };
  let action = "Predvajaj naročilo";
  let ActionIcon = Play;
  if (demo.running) {
    action = "Začasno ustavi";
    ActionIcon = CirclePause;
  } else if (demo.stage === "payment") {
    action = "Potrdi demo plačilo";
    ActionIcon = CreditCard;
  } else if (demo.stage === "complete") {
    action = "Predvajaj znova";
    ActionIcon = RotateCcw;
  } else if (demo.time > 0) {
    action = "Nadaljuj";
  }

  const playbackPanel = (
    <div className="zeleno-playback">
      <p aria-live="polite" className="zeleno-status">
        {statusCopy[demo.stage]}
      </p>
      <div className="zeleno-playback-actions">
        <Button
          className="h-11 flex-1"
          disabled={!ready || failed}
          onClick={playback}
        >
          <ActionIcon data-icon="inline-start" />
          {action}
        </Button>
        <Button
          aria-label="Ponastavi prikaz"
          className="size-11"
          onClick={() => {
            demo.reset();
          }}
          size="icon"
          variant="outline"
        >
          <RotateCcw />
        </Button>
      </div>
      <p className="zeleno-demo-note">
        Demonstracija · brez pravega plačila ali AI poslušanja
      </p>
    </div>
  );

  return (
    <main
      className="zeleno"
      data-stage={demo.stage}
      data-testid="zeleno-demo"
      data-time={demo.time.toFixed(2)}
      lang="sl"
    >
      <header className="zeleno-header">
        <a aria-label="Zeleno, začetek" className="zeleno-brand" href="/zeleno">
          <Sprout aria-hidden="true" />
          <span>
            zeleno<span className="zeleno-brand-dot">.</span>
          </span>
        </a>
        <span className="zeleno-header-label">
          MALA PRODAJALNA. VELIKA IDEJA.
        </span>
        <Badge variant="outline">
          <span className="zeleno-live-dot" />
          Koncept 01
        </Badge>
      </header>
      <section className="zeleno-intro">
        <div>
          <p className="zeleno-eyebrow">LOKALNA HRANA × PAMETNA TEHNOLOGIJA</p>
          <h1>
            Z vrta. V škatlo. <span>Zate.</span>
          </h1>
        </div>
        <p>
          Tvoja soseska. Sveža zelenjava. Ena robotska roka.
          <br />
          <span>Razišči idejo avtomatske prodajalne.</span>
        </p>
      </section>
      <div className="zeleno-workspace">
        <section
          aria-label="Interaktivni 3D prikaz prodajalne"
          className="zeleno-viewer"
        >
          <div className="zeleno-viewer-heading">
            <span>
              <span className="zeleno-live-dot" />
              PROSTORSKI KONCEPT
            </span>
            <span>01 / ZELENA PRODAJALNA</span>
          </div>
          <div
            className="zeleno-canvas"
            data-ready={ready && !failed}
            data-testid="zeleno-scene"
          >
            <ZelenoCanvas
              cameraReset={cameraReset}
              cutaway={cutaway}
              onError={onError}
              onReady={onReady}
              palette={palette}
              playing={demo.running}
              source={demo.source}
              view={view}
            />
            {!ready && !failed && (
              <output className="zeleno-loading">
                Postavljamo prodajalno …
              </output>
            )}
            {failed && (
              <div className="zeleno-loading" role="alert">
                <p>3D prikaza ni bilo mogoče naložiti.</p>
                <Button
                  onClick={() => {
                    window.location.reload();
                  }}
                  variant="outline"
                >
                  Poskusi znova
                </Button>
              </div>
            )}
          </div>
          <div className="zeleno-scene-caption">
            <span>
              6,0 × 2,4 × 2,6 m{" "}
              <span className="zeleno-assumption">/ okvirne mere</span>
            </span>
            <span>Povleci za vrtenje · približaj s koleščkom</span>
          </div>
          <div className="zeleno-view-controls">
            <ToggleGroup
              aria-label="Pogled na prodajalno"
              onValueChange={(values) => {
                const [next] = values;
                if (
                  next === "perspective" ||
                  next === "front" ||
                  next === "top"
                ) {
                  setView(next);
                  if (next === "top") {
                    setCutaway(true);
                  }
                }
              }}
              size="sm"
              value={[view]}
              variant="outline"
            >
              <ToggleGroupItem
                aria-label="Prostorski pogled"
                value="perspective"
              >
                <Cuboid data-icon="inline-start" />
                3D
              </ToggleGroupItem>
              <ToggleGroupItem aria-label="Pogled od spredaj" value="front">
                <Maximize data-icon="inline-start" />
                Spredaj
              </ToggleGroupItem>
              <ToggleGroupItem aria-label="Pogled od zgoraj" value="top">
                <ArrowDown data-icon="inline-start" />
                Tloris
              </ToggleGroupItem>
            </ToggleGroup>
            <label className="zeleno-cutaway" htmlFor="zeleno-cutaway">
              <Switch
                id="zeleno-cutaway"
                checked={cutaway}
                onCheckedChange={setCutaway}
              />
              Odprti prerez
            </label>
            <Button
              aria-label="Ponastavi kamero"
              onClick={() => {
                setCameraReset((value) => value + 1);
              }}
              size="icon"
              variant="ghost"
            >
              <RotateCcw />
            </Button>
          </div>
          <div className="zeleno-playback-mobile">{playbackPanel}</div>
          <div className="zeleno-legend">
            <span>
              <i />
              Police s pridelki
            </span>
            <span>
              <i />
              Roka na tirnici
            </span>
            <span>
              <i />
              Naročilo in prevzem
            </span>
          </div>
        </section>
        <aside aria-label="Potek naročila" className="zeleno-story">
          <p className="zeleno-eyebrow">TAKO BI DELOVALO</p>
          <h2>
            Od »živjo« <br />
            do dober tek.
          </h2>
          <ol className="zeleno-steps">
            {steps.map(({ name, note, icon: Icon }, i) => (
              <li
                aria-current={activeStep === i ? "step" : undefined}
                data-complete={activeStep > i || demo.stage === "complete"}
                key={name}
              >
                <span className="zeleno-step-number">
                  {activeStep > i || demo.stage === "complete" ? (
                    <Check />
                  ) : (
                    `0${i + 1}`
                  )}
                </span>
                <div>
                  <h3>
                    {name}
                    <Icon aria-hidden="true" />
                  </h3>
                  <p>{note}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="zeleno-playback-desktop">{playbackPanel}</div>
        </aside>
      </div>
      <section aria-label="Primer naročila" className="zeleno-order">
        <div className="zeleno-order-heading">
          <Mic aria-hidden="true" />
          <div>
            <p className="zeleno-eyebrow">PRIMER GLASOVNEGA NAROČILA</p>
            <p>»En paradižnik, korenček in solato, prosim.«</p>
          </div>
        </div>
        <div className="zeleno-basket">
          <span>
            <i className="zeleno-tomato" />
            1× paradižnik
          </span>
          <span>
            <i className="zeleno-carrot" />
            1× korenček
          </span>
          <span>
            <Leaf aria-hidden="true" />
            1× solata
          </span>
          <ArrowUpRight aria-hidden="true" />
          <strong>Ena sveža škatla.</strong>
        </div>
      </section>
      <Separator />
      <section className="zeleno-next">
        <div>
          <p className="zeleno-eyebrow">ZA NASLEDNJO KAVO</p>
          <h2>
            Ideja je tu.
            <br />
            Zdaj jo prilagodimo.
          </h2>
        </div>
        <div>
          <span>01</span>
          <h3>Kateri pridelki?</h3>
          <p>
            Posamezni kosi, pakirani izdelki ali tehtanje? Izbira določi
            prijemalo in police.
          </p>
        </div>
        <div>
          <span>02</span>
          <h3>Kakšen kontejner?</h3>
          <p>
            Preverimo dejanske mere, dostop za polnjenje in prostor za hlajenje.
          </p>
        </div>
        <div>
          <span>03</span>
          <h3>Kako do prvega nakupa?</h3>
          <p>
            Najprej en izdelek: pobiranje, odlaganje, potrditev plačila in
            prevzem.
          </p>
        </div>
      </section>
      <footer className="zeleno-footer">
        <span>
          <Sprout aria-hidden="true" />
          Iz pogovora ob kavi v prostorsko idejo.
        </span>
        <span>Koncept za pogovor · ni izvedbeni načrt</span>
      </footer>
    </main>
  );
};
