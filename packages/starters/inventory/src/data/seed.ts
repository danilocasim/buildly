import { adjustments, items } from "./models";

export async function seed(): Promise<void> {
  const demo = [
    { name: "USB-C cable", sku: "CAB-USBC-1M", location: "Shelf A1", quantity: 24, lowStockAt: 5 },
    { name: "HDMI adapter", sku: "ADP-HDMI", location: "Shelf A2", quantity: 3, lowStockAt: 4 },
    {
      name: "Label printer tape",
      sku: "TAPE-12MM",
      location: "Drawer B",
      quantity: 9,
      lowStockAt: 3,
    },
    {
      name: "Packing boxes (medium)",
      sku: "BOX-M",
      location: "Back room",
      quantity: 40,
      lowStockAt: 10,
    },
    { name: "Wireless mouse", sku: "MOU-WL", location: "Shelf C3", quantity: 7, lowStockAt: 2 },
  ];
  for (const fields of demo) {
    const item = await items.create({ ...fields, isDemo: true });
    await adjustments.create({
      itemId: item.id,
      delta: fields.quantity,
      reason: "Initial count",
      quantityAfter: fields.quantity,
      isDemo: true,
    });
  }
}
