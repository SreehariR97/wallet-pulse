import { randomUUID } from "crypto";
import { db } from "./index";
import { categories } from "./schema";
import { DEFAULT_CATEGORIES } from "./defaults";

/** The default category rows for a new user (not yet inserted). */
export function defaultCategoryRows(userId: string) {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    id: randomUUID(),
    userId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: c.type,
    isDefault: true,
    sortOrder: i,
  }));
}

export async function seedDefaultCategoriesForUser(userId: string) {
  await db.insert(categories).values(defaultCategoryRows(userId));
}

if (require.main === module) {
  console.log("Seed script ready. Categories are created per-user on signup.");
}
