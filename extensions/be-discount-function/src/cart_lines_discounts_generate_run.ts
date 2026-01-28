// Adjust the import path/type names to match your scaffolded generated types.
// Commonly it is: import type { InputQuery, FunctionRunResult } from "../generated/api";
import type {
  CartLinesDiscountsGenerateRunInput,
  CartLinesDiscountsGenerateRunResult,
} from "../generated/api";

type Config = {
  triggerBE: number;         // e.g., 6
  amountPerTrigger: number;  // e.g., 10 (CAD)
};

const DEFAULT_CONFIG: Config = { triggerBE: 6, amountPerTrigger: 10 };
const MESSAGE = "Basket Booster discount";

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function run(
  input: CartLinesDiscountsGenerateRunInput
): CartLinesDiscountsGenerateRunResult {
  const raw = (input.discount?.metafield?.jsonValue ?? null) as any;

  const triggerBE =
    Math.max(1, Math.floor(toNumber(raw?.triggerBE) ?? DEFAULT_CONFIG.triggerBE));

  const amountPerTrigger =
    Math.max(0, toNumber(raw?.amountPerTrigger) ?? DEFAULT_CONFIG.amountPerTrigger);

  if (amountPerTrigger <= 0) return { operations: [] };

  // Sum Bottle Equivalents across all cart lines
  let totalBE = 0;

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const beValue = line.merchandise.product?.metafield?.value;
    const be = toNumber(beValue) ?? 0;

    if (be <= 0) continue; // allows 2L products (BE=0) to contribute nothing
    totalBE += be * line.quantity;
  }

  const triggers = Math.floor(totalBE / triggerBE);
  if (triggers <= 0) return { operations: [] };

  const subtotal = toNumber(input.cart.cost.subtotalAmount.amount) ?? 0;
  if (subtotal <= 0) return { operations: [] };

  const rawDiscount = triggers * amountPerTrigger;
  const discountAmount = Math.min(subtotal, rawDiscount);

  if (discountAmount <= 0) return { operations: [] };

  return {
    operations: [
      {
        orderDiscountsAdd: {
          selectionStrategy: "FIRST",
          candidates: [
            {
              message: MESSAGE,
              targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
              value: {
                fixedAmount: {
                  // Most generated types expect string here; keep it deterministic.
                  amount: discountAmount.toFixed(2),
                },
              },
            },
          ],
        },
      },
    ],
  };
}
