// node_modules/@shopify/shopify_function/run.ts
function run_default(userfunction) {
  try {
    ShopifyFunction;
  } catch (e) {
    throw new Error(
      "ShopifyFunction is not defined. Please rebuild your function using the latest version of Shopify CLI."
    );
  }
  const input_obj = ShopifyFunction.readInput();
  const output_obj = userfunction(input_obj);
  ShopifyFunction.writeOutput(output_obj);
}

// extensions/be-discount-function/src/index.ts
var DEFAULT_CONFIG = {
  triggerBE: 6,
  amountPerTrigger: 10,
  maxDiscount: 0,
  showConfigInMessage: false
};
var MESSAGE_PREFIX = "Basket Booster discount";
function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
function safeParseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
function normalizeConfig(raw) {
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
    toNumber(raw?.maxDiscount) ?? DEFAULT_CONFIG.maxDiscount
  );
  const showConfigInMessage = typeof raw?.showConfigInMessage === "boolean" ? raw.showConfigInMessage : DEFAULT_CONFIG.showConfigInMessage;
  return { triggerBE, amountPerTrigger, maxDiscount, showConfigInMessage };
}
function readLineBE(line) {
  if (line.merchandise.__typename !== "ProductVariant") return 0;
  const variantPreferred = toNumber(line.merchandise.beMetafield?.value);
  if (variantPreferred != null) return Math.max(0, variantPreferred);
  const variantLegacy = toNumber(line.merchandise.legacyBeMetafield?.value);
  if (variantLegacy != null) return Math.max(0, variantLegacy);
  const productPreferred = toNumber(line.merchandise.product?.beMetafield?.value);
  if (productPreferred != null) return Math.max(0, productPreferred);
  const productLegacy = toNumber(line.merchandise.product?.legacyBeMetafield?.value);
  if (productLegacy != null) return Math.max(0, productLegacy);
  return 0;
}
function cartLinesDiscountsGenerateRun(input) {
  const mf = input.discount?.metafield;
  const rawConfig = safeParseJson(mf?.jsonValue) ?? safeParseJson(mf?.value);
  const cfg = normalizeConfig(rawConfig);
  if (cfg.amountPerTrigger <= 0) return { operations: [] };
  let totalBE = 0;
  for (const line of input.cart.lines) {
    const be = readLineBE(line);
    if (be <= 0) continue;
    totalBE += be * line.quantity;
  }
  const triggers = Math.floor(totalBE / cfg.triggerBE);
  if (triggers <= 0) return { operations: [] };
  const subtotal = toNumber(input.cart.cost.subtotalAmount.amount) ?? 0;
  if (subtotal <= 0) return { operations: [] };
  const rawDiscount = triggers * cfg.amountPerTrigger;
  let discountAmount = Math.min(subtotal, rawDiscount);
  if (cfg.maxDiscount > 0) {
    discountAmount = Math.min(discountAmount, cfg.maxDiscount);
  }
  if (discountAmount <= 0) return { operations: [] };
  const message = cfg.showConfigInMessage ? `${MESSAGE_PREFIX} (trigger=${cfg.triggerBE}, amt=${cfg.amountPerTrigger}, cap=${cfg.maxDiscount})` : MESSAGE_PREFIX;
  return {
    operations: [
      {
        orderDiscountsAdd: {
          selectionStrategy: "FIRST",
          candidates: [
            {
              message,
              targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
              value: {
                fixedAmount: {
                  amount: discountAmount.toFixed(2)
                }
              }
            }
          ]
        }
      }
    ]
  };
}

// <stdin>
function cartLinesDiscountsGenerateRun2() {
  return run_default(cartLinesDiscountsGenerateRun);
}
export {
  cartLinesDiscountsGenerateRun2 as cartLinesDiscountsGenerateRun
};
