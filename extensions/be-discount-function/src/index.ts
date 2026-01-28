import type {
  CartLinesDiscountsGenerateRunInput,
  CartLinesDiscountsGenerateRunResult,
} from "../generated/api";

type Config = {
  triggerBE: number;
  amountPerTrigger: number;
  maxDiscount?: number; // 0 or undefined = no cap
};

const DEFAULT_CONFIG: Config = { triggerBE: 6, amountPerTrigger: 10, maxDiscount: 0 };

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ✅ IMPORTANT: this exact export name must exist
export function cartLinesDiscountsGenerateRun(
  input: CartLinesDiscountsGenerateRunInput
): CartLinesDiscountsGenerateRunResult {
  const raw = (input.discount?.metafield?.jsonValue ?? null) as any;

  const triggerBE = Math.max(
    1,
    Math.floor(toNumber(raw?.triggerBE) ?? DEFAULT_CONFIG.triggerBE)
  );

  const amountPerTrigger = Math.max(
    0,
    toNumber(raw?.amountPerTrigger) ?? DEFAULT_CONFIG.amountPerTrigger
  );

  const maxDiscount = Math.max(
    0,
    toNumber(raw?.maxDiscount) ?? (DEFAULT_CONFIG.maxDiscount ?? 0)
  );

  if (amountPerTrigger <= 0) return { operations: [] };

  // Sum Bottle Equivalents (BE)
  let totalBE = 0;

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    // Variant first; Product fallback
    const beValue =
      line.merchandise.metafield?.value ??
      line.merchandise.product?.metafield?.value;

    const be = toNumber(beValue) ?? 0;
    if (be <= 0) continue;

    totalBE += be * line.quantity;
  }

  const triggers = Math.floor(totalBE / triggerBE);
  if (triggers <= 0) return { operations: [] };

  const subtotal = toNumber(input.cart.cost.subtotalAmount.amount) ?? 0;
  if (subtotal <= 0) return { operations: [] };

  const rawDiscount = triggers * amountPerTrigger;

  // Always cap to subtotal; optionally cap to maxDiscount (if > 0)
  let discountAmount = Math.min(subtotal, rawDiscount);
  if (maxDiscount > 0) discountAmount = Math.min(discountAmount, maxDiscount);

  if (discountAmount <= 0) return { operations: [] };

  return {
    operations: [
      {
        orderDiscountsAdd: {
          selectionStrategy: "FIRST",
          candidates: [
            {
              message: "Bottle Equivalent discount",
              targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
              value: {
                fixedAmount: { amount: discountAmount.toFixed(2) },
              },
            },
          ],
        },
      },
    ],
  };
}
