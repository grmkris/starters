import { RoomId } from "@agent-native/domain";
import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";

import { typeIdPrimaryKey } from "./columns";

export const rooms = pgTable("rooms", {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  id: typeIdPrimaryKey(RoomId),
  maxPlayers: integer("max_players").notNull().default(16),
});
