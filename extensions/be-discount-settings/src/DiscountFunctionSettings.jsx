import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

/**
 * Discount Function Settings UI
 *
 * Persisted configuration location (per your prior debugging):
 *   Discount*Node.metafield(namespace: "custom", key: "function-configuration")
 *
 * Why we are not using $app (brief):
 * - Discount function config is a property of the Discount node, not the App / AppInstallation.
 * - In your GraphiQL results for DiscountAutomaticNode, the app-owned metafield was null while the
 *   custom metafield contained the real JSON config.
 * - Writing to app-owned namespaces on this resource has produced namespace/key access errors for you.
 *
 * This UI extension:
 * 1) Reads existing config from the discount's custom metafield (if present)
 * 2) Creates it with defaults if missing
 * 3) Saves updates back to the same custom metafield
 *
 * Robustness:
 * - Primary: shopify.applyMetafieldChange (native function settings workflow)
 * - Fallback: direct Admin GraphQL metafieldsSet (covers edge cases where applyMetafieldChange fails)
 */

const METAFIELD_NAMESPACE = "custom";
const METAFIELD_KEY = "function-configuration";
const METAFIELD_TYPE = "json";

const DEFAULT_CONFIG = {
  triggerBE: 6,
  amountPerTrigger: 10,
  maxDiscount: 0, // 0 = no cap
  showConfigInMessage: false,
};

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function intOrDefault(v, d) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : d;
}

function numOrDefault(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

function safeParseJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getExtensionData() {
  // Some runtimes expose shopify.data as a plain object, others as a signal-like { value }.
  const d = shopify?.data;
  if (!d) return null;
  if (typeof d === "object" && d !== null && "value" in d && d.value) return d.value;
  return d;
}

function getMetafieldsFromData(data) {
  const mfs = data?.metafields;
  return Array.isArray(mfs) ? mfs : [];
}

function findConfigMetafield(metafields) {
  return (
    metafields.find(
      (m) => m && m.namespace === METAFIELD_NAMESPACE && m.key === METAFIELD_KEY
    ) || null
  );
}

async function adminGraphql(query, variables) {
  const res = await fetch("shopify:admin/api/graphql.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      errors: [{ message: "Network error" }],
      data: null,
    };
  }
  if (json.errors?.length) {
    return { ok: false, status: res.status, errors: json.errors, data: json.data ?? null };
  }
  return { ok: true, status: res.status, errors: [], data: json.data ?? null };
}

async function fetchConfigViaGraphql(discountNodeId) {
  if (!discountNodeId) return null;

  const query = `
    query GetDiscountConfig($id: ID!) {
      node(id: $id) {
        __typename
        ... on DiscountAutomaticNode {
          metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
            id
            type
            value
            namespace
            key
          }
        }
        ... on DiscountCodeNode {
          metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
            id
            type
            value
            namespace
            key
          }
        }
      }
    }
  `;

  const r = await adminGraphql(query, { id: discountNodeId });
  if (!r.ok) return null;

  const node = r.data?.node;
  const mf = node?.metafield ?? null;
  return mf && mf.namespace === METAFIELD_NAMESPACE && mf.key === METAFIELD_KEY ? mf : null;
}

async function setConfigViaGraphql(discountNodeId, cfg) {
  const mutation = `
    mutation SetDiscountConfig($ownerId: ID!, $value: String!) {
      metafieldsSet(
        metafields: [{
          ownerId: $ownerId,
          namespace: "${METAFIELD_NAMESPACE}",
          key: "${METAFIELD_KEY}",
          type: "${METAFIELD_TYPE}",
          value: $value
        }]
      ) {
        metafields { id namespace key type value }
        userErrors { field message }
      }
    }
  `;

  const value = JSON.stringify(cfg);
  const r = await adminGraphql(mutation, { ownerId: discountNodeId, value });

  if (!r.ok) {
    return { ok: false, message: (r.errors?.[0]?.message ?? "GraphQL error") };
  }

  const userErrors = r.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) {
    return { ok: false, message: userErrors.map((e) => e.message).join("; ") };
  }

  return { ok: true, metafield: r.data?.metafieldsSet?.metafields?.[0] ?? null };
}

async function applyMetafieldChange(cfg) {
  const value = JSON.stringify(cfg);
  return await shopify.applyMetafieldChange({
    type: "updateMetafield",
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
    valueType: METAFIELD_TYPE,
    value,
  });
}

function Extension() {
  const data = getExtensionData();

  const dataMetafields = useMemo(() => getMetafieldsFromData(data), [data]);
  const cfgMetafield = useMemo(() => findConfigMetafield(dataMetafields), [dataMetafields]);

  const [initialCfg, setInitialCfg] = useState(DEFAULT_CONFIG);
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ tone: "subdued", text: "" });

  // Bootstrap: load existing config (injected metafields first, GraphQL fallback),
  // and ensure a metafield exists (create defaults if missing).
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);
        setStatus({ tone: "subdued", text: "" });

        if (!data?.id) {
          setStatus({
            tone: "critical",
            text:
              "Missing discount context (shopify.data.id). Open this page from a discount details screen.",
          });
          return;
        }

        // 1) Prefer injected metafields (fast + offline).
        let mf = cfgMetafield;

        // 2) Fallback: read via Admin GraphQL.
        if (!mf) {
          mf = await fetchConfigViaGraphql(data.id);
        }

        if (mf?.value) {
          const parsed = safeParseJson(mf.value);
          const loadedCfg = parsed ? { ...DEFAULT_CONFIG, ...parsed } : DEFAULT_CONFIG;

          if (!cancelled) {
            setInitialCfg(loadedCfg);
            setCfg(loadedCfg);
          }
          return;
        }

        // Not found: create defaults (applyMetafieldChange first, GraphQL fallback).
        const res = await applyMetafieldChange(DEFAULT_CONFIG);
        if (res?.type === "error") {
          const g = await setConfigViaGraphql(data.id, DEFAULT_CONFIG);
          if (!g.ok && !cancelled) {
            setStatus({ tone: "critical", text: `Couldn't create config: ${g.message}` });
          }
        }

        if (!cancelled) {
          setInitialCfg(DEFAULT_CONFIG);
          setCfg(DEFAULT_CONFIG);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus({
            tone: "critical",
            text: `Failed to load settings: ${e?.message ?? String(e)}`,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [data?.id, cfgMetafield?.id]);

  const previewMessage = useMemo(() => {
    const parts = [];
    parts.push(`${intOrDefault(cfg.triggerBE, DEFAULT_CONFIG.triggerBE)} BE`);
    parts.push(`${money(numOrDefault(cfg.amountPerTrigger, DEFAULT_CONFIG.amountPerTrigger))} per trigger`);
    if (numOrDefault(cfg.maxDiscount, 0) > 0) {
      parts.push(`cap ${money(cfg.maxDiscount)}`);
    }
    return parts.join(" • ");
  }, [cfg]);

  const onSubmit = async () => {
    setStatus({ tone: "subdued", text: "" });

    const cleanCfg = {
      triggerBE: intOrDefault(cfg.triggerBE, DEFAULT_CONFIG.triggerBE),
      amountPerTrigger: numOrDefault(cfg.amountPerTrigger, DEFAULT_CONFIG.amountPerTrigger),
      maxDiscount: numOrDefault(cfg.maxDiscount, 0),
      showConfigInMessage: Boolean(cfg.showConfigInMessage),
    };

    const res = await applyMetafieldChange(cleanCfg);
    if (res?.type === "error") {
      const current = getExtensionData();
      const g = await setConfigViaGraphql(current?.id, cleanCfg);
      if (!g.ok) {
        setStatus({
          tone: "critical",
          text: `Save failed: ${res.message ?? "applyMetafieldChange error"}; ${g.message}`,
        });
        return;
      }
    }

    setInitialCfg(cleanCfg);
    setCfg(cleanCfg);
    setStatus({ tone: "subdued", text: "Saved." });
  };

  const onReset = () => {
    setCfg(initialCfg);
    setStatus({ tone: "subdued", text: "Reverted changes." });
  };

  const handleTriggerChange = (value) => {
    setCfg((p) => ({ ...p, triggerBE: intOrDefault(value, DEFAULT_CONFIG.triggerBE) }));
  };

  const handleAmountChange = (value) => {
    setCfg((p) => ({ ...p, amountPerTrigger: numOrDefault(value, DEFAULT_CONFIG.amountPerTrigger) }));
  };

  const handleMaxChange = (value) => {
    setCfg((p) => ({ ...p, maxDiscount: numOrDefault(value, 0) }));
  };

  const handleShowInMsgChange = (checked) => {
    setCfg((p) => ({ ...p, showConfigInMessage: Boolean(checked) }));
  };

  return (
    <s-function-settings onSubmit={onSubmit} onReset={onReset}>
      <s-stack gap="large">
        <s-text variant="headingLg">Basket Booster configuration</s-text>

        {status.text ? <s-text tone={status.tone}>{status.text}</s-text> : null}

        <s-stack gap="small">
          <s-text variant="headingMd">Preview</s-text>
          <s-text>
            {cfg.showConfigInMessage ? previewMessage : "Config details hidden in message"}
          </s-text>
        </s-stack>

        <s-stack gap="base">
          <s-number-field
            label="Bottle Equivalents required per trigger (BE)"
            value={String(cfg.triggerBE)}
            onChange={handleTriggerChange}
            min={1}
            step={1}
            helpText="Example: 6 BE triggers the discount once; 12 BE triggers it twice, etc."
            disabled={loading}
          />

          <s-number-field
            label="Discount amount per trigger"
            value={String(cfg.amountPerTrigger)}
            onChange={handleAmountChange}
            min={0}
            step={0.01}
            helpText="Fixed dollar amount applied per trigger."
            disabled={loading}
          />

          <s-number-field
            label="Maximum discount cap (0 = no cap)"
            value={String(cfg.maxDiscount)}
            onChange={handleMaxChange}
            min={0}
            step={0.01}
            helpText="Optional: set an overall cap for this discount. Use 0 for no cap."
            disabled={loading}
          />

          <s-checkbox
            checked={Boolean(cfg.showConfigInMessage)}
            onChange={handleShowInMsgChange}
            disabled={loading}
          >
            Show config details in discount message
          </s-checkbox>

          <s-text tone="subdued">Stored on discount metafield: custom.function-configuration</s-text>
        </s-stack>
      </s-stack>
    </s-function-settings>
  );
}

export default async () => {
  // Shopify scaffolds this extension to mount to document.body.
  render(<Extension />, document.body);
};
