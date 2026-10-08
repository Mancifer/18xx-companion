import type { GameDefinition } from "../domain/games/schema";
import type { CompanionDb } from "./db";

/** Custom games (FR-007). Built-ins live in code and are never written here. */
export class GamesRepo {
  constructor(private readonly db: CompanionDb) {}

  async list(): Promise<GameDefinition[]> {
    const all = await this.db.getAll("games");
    return all.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  get(id: string): Promise<GameDefinition | undefined> {
    return this.db.get("games", id);
  }

  async save(game: GameDefinition): Promise<void> {
    if (!game.basedOn) throw new Error("Only custom games (with basedOn) can be saved");
    await this.db.put("games", game);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete("games", id);
  }
}
