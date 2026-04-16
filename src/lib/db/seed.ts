import { randomUUID } from "crypto";
import { db } from "./index";
import { categories } from "./schema";
import { DEFAULT_CATEGORIES } from "./defaults";

export async function seedDefaultCategoriesForUser(userId: string) {
  const rows = DEFAULT_CATEGORIES.map((c, i) => ({
    id: randomUUID(),
    userId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: c.type,
    isDefault: true,
    sortOrder: i,
  }));
  await db.insert(categories).values(rows);
}

if (require.main === module) {
  console.log("Seed script ready. Categories are created per-user on signup.");
}
