import { createRepository, defineCollection, type BaseRecord } from "./store";

// Bump when a model's shape changes; the app then reseeds demo data.
export const schemaVersion = 1;

export interface Item extends BaseRecord {
  name: string;
  sku: string;
  location: string;
  quantity: number;
  /** Show a low-stock warning at or below this quantity. */
  lowStockAt: number;
}

export interface Adjustment extends BaseRecord {
  itemId: string;
  /** Positive for stock in, negative for stock out. */
  delta: number;
  reason: string;
  quantityAfter: number;
}

export const items = createRepository(
  defineCollection<Item>("items", { searchFields: ["name", "sku", "location"] }),
);
export const adjustments = createRepository(
  defineCollection<Adjustment>("adjustments", { searchFields: ["reason"] }),
);

export function isLowStock(item: Item): boolean {
  return item.quantity <= item.lowStockAt;
}

/** Changes an item's quantity and records why. Stock cannot go below zero. */
export async function adjustStock(
  itemId: string,
  delta: number,
  reason: string,
): Promise<Adjustment> {
  const item = await items.get(itemId);
  if (!item) throw new Error("Item not found");
  if (!Number.isInteger(delta) || delta === 0)
    throw new Error("Change the quantity by at least one");
  const quantityAfter = item.quantity + delta;
  if (quantityAfter < 0) throw new Error(`Only ${item.quantity} in stock`);
  await items.update(itemId, { quantity: quantityAfter });
  return adjustments.create({
    itemId,
    delta,
    reason: reason.trim() || (delta > 0 ? "Restock" : "Used"),
    quantityAfter,
  });
}
