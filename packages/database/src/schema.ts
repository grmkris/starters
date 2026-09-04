import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rooms = pgTable("rooms", {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  id: text("id").primaryKey(),
  maxPlayers: integer("max_players").notNull().default(16),
});
