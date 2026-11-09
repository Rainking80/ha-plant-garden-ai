/** Garden rules the panel points out. */
import type { Plant, Shape, Task } from "../api/types";
import { parseLocalDate, todayIso } from "./format";

/**
 * Germany, § 39 (5) 2 BNatSchG: from 1 March to 30 September only gentle
 * shaping and care cuts of hedges are allowed. True for an open pruning task of
 * a hedge (or a plant drawn as a hedge) that falls into that time.
 */
export function hedgeCutRestricted(
  task: Pick<Task, "kind" | "status" | "due" | "plant_id">,
  plant: Pick<Plant, "id" | "category"> | undefined,
  shapes: Pick<Shape, "kind" | "plant_id">[],
  country: string | null | undefined,
  today = todayIso(),
): boolean {
  if (country !== "DE" || task.kind !== "prune" || task.status !== "open" || !plant) return false;
  const hedge =
    plant.category === "hedge" ||
    shapes.some((shape) => shape.kind === "hedge" && shape.plant_id === plant.id);
  if (!hedge) return false;
  const month = parseLocalDate(task.due ?? today).getMonth() + 1;
  return month >= 3 && month <= 9;
}
