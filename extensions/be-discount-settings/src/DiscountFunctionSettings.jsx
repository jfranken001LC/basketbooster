import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useMemo, useState } from "preact/hooks";

const DEFAULT_CONFIG = { triggerBE: 6, amountPerTrigger: 10, maxDiscount: 0 };

const money = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
};

const intOrDefault = (v, d) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : d;
};

const numOrDefault = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  // In Discount Function Settings extensions, Shopify exposes the discount metafields here.
  // This array can be empty for a brand-new discount until the first save occurs.
  const metafields = shopify.data?.metafields ?? [];

  // Prefer the exact metafield if it exists already.
  const existingConfigMetafield =
    metafields.find((m) => m?.key === "function-configuration") ?? metafields[0];

  const initial = useMemo(() => {
    try {
      const parsed = existingConfigMetafield?.value
        ? JSON.parse(existingConfigMetafield.value)
        : null;

      const triggerBE = intOrDefault(parsed?.triggerBE, DEFAULT_CONFIG.triggerBE);
      const amountPerTrigger = Math.max(
        0,
        numOrDefault(parsed?.amountPerTrigger, DEFAULT_CONFIG.amountPerTrigger)
      );
      const maxDiscount = Math.max(
        0,
        numOrDefault(parsed?.maxDiscount, DEFAULT_CONFIG.maxDiscount)
      );

      return { triggerBE, amountPerTrigger, maxDiscount };
    } catch {
      return DEFAULT_CONFIG;
    }
  }, [existingConfigMetafield?.value]);

  const [triggerBE, setTriggerBE] = useState(String(initial.triggerBE));
  const [amountPerTrigger, setAmountPerTrigger] = useState(String(initial.amountPerTrigger));
  const [maxDiscount, setMaxDiscount] = useState(String(initial.maxDiscount));

  function resetForm() {
    setTriggerBE(String(initial.triggerBE));
    setAmountPerTrigger(String(initial.amountPerTrigger));
    setMaxDiscount(String(initial.maxDiscount));
  }

  async function save() {
    const config = {
      triggerBE: intOrDefault(triggerBE, DEFAULT_CONFIG.triggerBE),
      amountPerTrigger: Math.max(
        0,
        numOrDefault(amountPerTrigger, DEFAULT_CONFIG.amountPerTrigger)
      ),
      // 0 = no cap
      maxDiscount: Math.max(0, numOrDefault(maxDiscount, DEFAULT_CONFIG.maxDiscount)),
    };

    // IMPORTANT:
    // - On first save, existingConfigMetafield may be undefined.
    // - Passing namespace: "$app" can be rejected.
    // - The API allows namespace to be omitted; Shopify will apply the correct app-scoped metafield.
    //   (namespace is optional for updateMetafield).  :contentReference[oaicite:1]{index=1}
    const change = {
      type: "updateMetafield",
      key: existingConfigMetafield?.key ?? "function-configuration",
      value: JSON.stringify(config),
      valueType: "json",
    };

    // Only include a namespace if Shopify already provided the resolved namespace.
    if (existingConfigMetafield?.namespace) {
      change.namespace = existingConfigMetafield.namespace;
    }

    const result = await shopify.applyMetafieldChange(change);

  }

  const trigger = intOrDefault(triggerBE, DEFAULT_CONFIG.triggerBE);
  const amt = Math.max(0, numOrDefault(amountPerTrigger, DEFAULT_CONFIG.amountPerTrigger));
  const cap = Math.max(0, numOrDefault(maxDiscount, DEFAULT_CONFIG.maxDiscount));

  const previewRows = [1, 2, 3].map((k) => {
    const be = trigger * k;
    const raw = amt * k;
    const applied = cap > 0 ? Math.min(raw, cap) : raw;
    const capped = cap > 0 && applied < raw;
    return { be, raw, applied, capped };
  });

  return (
    <s-function-settings onSubmit={(e) => e.waitUntil(save())} onReset={resetForm}>
      <s-stack gap="base">
        <s-number-field
          label="Bottle equivalents needed to trigger"
          name="triggerBE"
          value={triggerBE}
          min="1"
          step="1"
          onChange={(e) => setTriggerBE(e.currentTarget.value)}
        />

        <s-number-field
          label="Discount amount per trigger (CAD)"
          name="amountPerTrigger"
          value={amountPerTrigger}
          min="0"
          step="0.01"
          onChange={(e) => setAmountPerTrigger(e.currentTarget.value)}
        />

        <s-number-field
          label="Maximum discount per order (CAD) — 0 means no cap"
          name="maxDiscount"
          value={maxDiscount}
          min="0"
          step="0.01"
          onChange={(e) => setMaxDiscount(e.currentTarget.value)}
        />

        <s-stack gap="tight">
          <s-text emphasis="bold">Preview (scales per trigger)</s-text>

          {previewRows.map((r) => (
            <s-text key={r.be} tone="subdued">
              {r.be} BE → {money(r.applied)} off raw {money(r.raw)}
              {r.capped ? " (capped)" : ""}
            </s-text>
          ))}

          <s-text tone="subdued">
            Example: If Trigger is {trigger} BE and Amount is {money(amt)}, then every {trigger} BE
            earns {money(amt)} off.{" "}
            {cap > 0 ? `A cap of ${money(cap)} per order is applied.` : "No cap is applied."}
          </s-text>

          <s-text tone="subdued">
            Note: At checkout, the discount is also limited by the cart subtotal (it will never exceed the subtotal).
          </s-text>
        </s-stack>

        <s-stack gap="tight">
          <s-text emphasis="bold">Product setup: Bottle Equivalent (BE) values</s-text>

          <s-text tone="subdued">
            This discount uses your Product (and optionally Variant) metafield definition shown in Admin as{" "}
            <s-text emphasis="bold">loyalty.bottle_equivalent</s-text> (Integer).
          </s-text>

          <s-text tone="subdued">Step-by-step:</s-text>

          <s-text tone="subdued">
            • Admin → Settings → Custom data → Products → ensure a definition exists for{" "}
            <s-text emphasis="bold">loyalty.bottle_equivalent</s-text> (Integer).
          </s-text>

          <s-text tone="subdued">
            • Admin → Products → open a product → Metafields → set Bottle Equivalent.
          </s-text>

          <s-text tone="subdued">
            • Recommended mapping for store with 250ml base: 250ml = 1 BE, 500ml = 2 BE, 2L = 4 BE.
          </s-text>

          <s-text tone="subdued">
            • Bulk update (fast): Admin → Products → select products → Bulk edit → add the metafield column and fill values.
          </s-text>

          <s-text tone="subdued">
            Optional (Variant-level BE): Create the same metafield definition under Settings → Custom data → Variants,
            set values on variants, and the function will use the Variant value first (Product is fallback).
          </s-text>
          
        </s-stack>
      </s-stack>
    </s-function-settings>
  );
}
