import { RoomCode } from "@agent-native/domain";
import { Button } from "@agent-native/ui/components/button";
import { Separator } from "@agent-native/ui/components/separator";
import { useNavigate } from "@tanstack/react-router";
import { Result, Schema } from "effect";
import { BotIcon, GlobeIcon, SwordsIcon, TicketIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { realtimeStore } from "../lib/realtime-store";

const decodeCode = Schema.decodeUnknownResult(RoomCode);

/** How long to wait for a person before the bot is offered instead. */
const BOT_OFFER_AFTER_SECONDS = 15;

/**
 * The front door of a duel. Make one and get a code, type the code from the
 * other phone, wait for anyone, or play the bot.
 */
export const DuelPage = () => {
  const navigate = useNavigate();
  const meta = useSyncExternalStore(
    realtimeStore.subscribeMeta,
    realtimeStore.getMetaSnapshot,
    realtimeStore.getMetaSnapshot
  );
  const duel = useSyncExternalStore(
    realtimeStore.subscribeDuel,
    realtimeStore.getDuelSnapshot,
    realtimeStore.getDuelSnapshot
  );
  const [typed, setTyped] = useState("");

  // Arriving here means no room: a duel that was in progress is left behind.
  useEffect(() => {
    realtimeStore.leaveRoom();
  }, []);

  // A created duel moves to its own page, which is also the link to share.
  useEffect(() => {
    if (duel.code !== null && duel.roomId !== null) {
      void navigate({ params: { code: duel.code }, to: "/duel/$code" });
    }
  }, [duel.code, duel.roomId, navigate]);

  const parsed = decodeCode(typed.toUpperCase());
  const live = meta.status === "live";

  return (
    <main className="mx-auto max-w-md p-4 sm:p-6" data-testid="duel-landing">
      <p className="text-primary font-mono text-xs tracking-[0.22em]">
        DUEL / TWO PHONES / ONE SEAM
      </p>
      <h1 className="mt-3 text-4xl leading-[0.94] font-semibold tracking-[-0.05em]">
        Put two phones side by side. Shoot across the gap.
      </h1>
      <p className="text-muted-foreground mt-4 text-sm leading-6">
        One thumb. Drag to slide, tap to shoot straight, flick to shoot at an
        angle. Three hits take a round, two rounds take the match.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Button
          className="w-full"
          disabled={!live}
          onClick={() => {
            realtimeStore.createDuel();
          }}
          size="lg"
        >
          <SwordsIcon data-icon="inline-start" />
          New duel
        </Button>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (Result.isSuccess(parsed)) {
              void navigate({
                params: { code: parsed.success },
                to: "/duel/$code",
              });
            }
          }}
        >
          <input
            aria-label="Duel code"
            autoCapitalize="characters"
            autoComplete="off"
            className="bg-background border-input min-w-0 flex-1 border px-3 py-2 text-center font-mono text-xl tracking-[0.3em] uppercase outline-none focus-visible:ring-2"
            inputMode="text"
            maxLength={4}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            placeholder="CODE"
            value={typed}
          />
          <Button
            disabled={!live || Result.isFailure(parsed)}
            size="lg"
            type="submit"
            variant="outline"
          >
            <TicketIcon data-icon="inline-start" />
            Join
          </Button>
        </form>

        <Separator className="my-2" />

        {duel.waiting === null ? (
          <Button
            className="w-full"
            disabled={!live}
            onClick={() => {
              realtimeStore.queueDuel();
            }}
            size="lg"
            variant="outline"
          >
            <GlobeIcon data-icon="inline-start" />
            Play anyone
          </Button>
        ) : (
          <div
            className="border-border flex flex-col gap-3 border p-4"
            data-testid="duel-queue"
          >
            <p className="text-muted-foreground font-mono text-xs tracking-[0.2em]">
              LOOKING FOR AN OPPONENT · {duel.waiting}s
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  realtimeStore.dequeueDuel();
                }}
                variant="ghost"
              >
                Cancel
              </Button>
              {duel.waiting >= BOT_OFFER_AFTER_SECONDS ? (
                <Button
                  onClick={() => {
                    realtimeStore.botDuel();
                  }}
                  variant="outline"
                >
                  <BotIcon data-icon="inline-start" />
                  Play the bot instead
                </Button>
              ) : null}
            </div>
          </div>
        )}
        <Button
          className="w-full"
          disabled={!live}
          onClick={() => {
            realtimeStore.botDuel();
          }}
          size="lg"
          variant="ghost"
        >
          <BotIcon data-icon="inline-start" />
          Play the bot
        </Button>
      </div>

      {duel.error === null ? null : (
        <p className="text-destructive mt-6 font-mono text-xs">{duel.error}</p>
      )}
      {live ? null : (
        <p className="text-muted-foreground mt-6 font-mono text-xs">
          CONNECTING…
        </p>
      )}
    </main>
  );
};
