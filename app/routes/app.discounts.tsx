import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

const FUNCTION_HANDLE = "be-discount-function";

type BasketBoosterConfig = {
  triggerBE: number;
  amountPerTrigger: number;
  maxDiscount: number;
};

type DiscountRow = {
  discountNodeId: string;
  discountId: string; // This is the DiscountAutomaticNode ID used for activate/deactivate/delete
  title: string;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
  config: BasketBoosterConfig | null;
};

function safeParseJson(value: unknown): any | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : null;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function listBasketBoosterDiscounts(admin: any): Promise<DiscountRow[]> {
  // We intentionally do NOT filter by functionId here, because:
  // - functionId is deprecated in modern API versions
  // - ShopifyFunction fields vary across Admin API versions
  // Instead, we identify Basket Booster discounts by the presence of our config metafield.
  const resp = await admin.graphql(
    `#graphql
    query ListDiscounts($first: Int!, $query: String!) {
      discountNodes(first: $first, query: $query) {
        nodes {
          id
          metafield(namespace: "custom", key: "function-configuration") {
            value
          }
          discount {
            __typename
            ... on DiscountAutomaticApp {
              discountId
              title
              status
              startsAt
              endsAt
              appDiscountType {
                title
                functionId
              }
            }
          }
        }
      }
    }`,
    {
      variables: {
        first: 100,
        query: "type:app",
      },
    }
  );

  const json = await resp.json();
  const nodes = json?.data?.discountNodes?.nodes ?? [];

  const rows: DiscountRow[] = [];

  for (const n of nodes) {
    const d = n?.discount;
    if (!d || d.__typename !== "DiscountAutomaticApp") continue;

    // Only show discounts that contain our config metafield.
    // (This avoids showing unrelated app discounts.)
    if (!n?.metafield?.value) continue;

    const cfg = safeParseJson(n?.metafield?.value);
    const config: BasketBoosterConfig | null =
      cfg && typeof cfg === "object"
        ? {
            triggerBE: Number(cfg.triggerBE ?? 0) || 0,
            amountPerTrigger: Number(cfg.amountPerTrigger ?? 0) || 0,
            maxDiscount: Number(cfg.maxDiscount ?? 0) || 0,
          }
        : null;

    rows.push({
      discountNodeId: n.id,
      discountId: d.discountId,
      title: d.title,
      status: d.status,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      config,
    });
  }

  // Stable sort: active first, then title
  rows.sort((a, b) => {
    const aActive = a.status === "ACTIVE" ? 0 : 1;
    const bActive = b.status === "ACTIVE" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.title.localeCompare(b.title);
  });

  return rows;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const discounts = await listBasketBoosterDiscounts(admin);
    return {
      ok: true,
      functionHandle: FUNCTION_HANDLE,
      discounts,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message ? String(e.message) : "Failed to load discounts.",
      functionHandle: FUNCTION_HANDLE,
      discounts: [] as DiscountRow[],
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("_action") || "");

  if (intent === "create") {
    const title = String(formData.get("title") || "").trim() || "Basket Booster discount";
    const triggerBE = intOrNull(formData.get("triggerBE"));
    const amountPerTrigger = numOrNull(formData.get("amountPerTrigger"));
    const maxDiscount = numOrNull(formData.get("maxDiscount"));

    const errors: Record<string, string> = {};
    if (!triggerBE || triggerBE < 1) errors.triggerBE = "Trigger BE must be 1 or higher.";
    if (amountPerTrigger === null || amountPerTrigger < 0)
      errors.amountPerTrigger = "Amount per trigger must be 0 or higher.";
    if (maxDiscount === null || maxDiscount < 0) errors.maxDiscount = "Max discount must be 0 or higher.";

    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    const config: BasketBoosterConfig = {
      triggerBE: triggerBE!,
      amountPerTrigger: amountPerTrigger!,
      maxDiscount: maxDiscount!,
    };

    // Use functionHandle (stable) instead of functionId (deprecated).
    // DiscountAutomaticAppInput supports functionHandle in API v2025-10+ and functionId is deprecated.
    const resp = await admin.graphql(
      `#graphql
      mutation CreateBasketBooster($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
            title
            status
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          automaticAppDiscount: {
            title,
            functionHandle: FUNCTION_HANDLE,
            discountClasses: ["PRODUCT"],
            startsAt: new Date().toISOString(),
            combinesWith: {
              orderDiscounts: false,
              productDiscounts: false,
              shippingDiscounts: false,
            },
            metafields: [
              {
                namespace: "custom",
                key: "function-configuration",
                type: "json",
                value: JSON.stringify(config),
              },
            ],
          },
        },
      }
    );

    const json = await resp.json();
    const payload = json?.data?.discountAutomaticAppCreate;
    const userErrors = payload?.userErrors ?? [];

    if (userErrors.length > 0) {
      return { ok: false, error: userErrors.map((e: any) => e.message).join("; ") };
    }

    return { ok: true, created: payload?.automaticAppDiscount ?? null };
  }

  if (intent === "activate" || intent === "deactivate" || intent === "delete") {
    const id = String(formData.get("discountId") || "");
    if (!id) return { ok: false, error: "Missing discountId." };

    const mutation =
      intent === "activate"
        ? `#graphql
          mutation Activate($id: ID!) {
            discountAutomaticActivate(id: $id) {
              userErrors { field message }
            }
          }`
        : intent === "deactivate"
          ? `#graphql
            mutation Deactivate($id: ID!) {
              discountAutomaticDeactivate(id: $id) {
                userErrors { field message }
              }
            }`
          : `#graphql
            mutation Delete($id: ID!) {
              discountAutomaticDelete(id: $id) {
                userErrors { field message }
              }
            }`;

    const resp = await admin.graphql(mutation, { variables: { id } });
    const json = await resp.json();

    const key =
      intent === "activate"
        ? "discountAutomaticActivate"
        : intent === "deactivate"
          ? "discountAutomaticDeactivate"
          : "discountAutomaticDelete";

    const userErrors = json?.data?.[key]?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { ok: false, error: userErrors.map((e: any) => e.message).join("; ") };
    }

    return { ok: true };
  }

  return { ok: false, error: "Unknown action." };
};

export default function DiscountsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const topMsg =
    actionData?.ok === true
      ? "Saved."
      : actionData?.ok === false && actionData?.error
        ? String(actionData.error)
        : null;

  return (
    <s-page heading="Discounts">
      <s-section heading="Create a Basket Booster discount">
        <s-paragraph>
          Create and manage your Basket Booster discounts directly from this app. Configuration is stored on the discount
          node as <code>custom/function-configuration</code>.
        </s-paragraph>

        {topMsg ? (
          <div
            style={{
              margin: "12px 0",
              padding: 12,
              borderRadius: 10,
              background: actionData?.ok ? "#e6fcf5" : "#fff4e5",
            }}
          >
            {topMsg}
          </div>
        ) : null}

        {data.ok === false ? (
          <div
            style={{
              margin: "12px 0",
              padding: 12,
              borderRadius: 10,
              background: "#fff4e5",
            }}
          >
            {data.error}
          </div>
        ) : null}

        <Form method="post">
          <input type="hidden" name="_action" value="create" />

          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <s-text-field
              name="title"
              label="Discount title"
              details="This is shown to merchants and customers at checkout."
              defaultValue="Basket Booster discount"
            />

            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                Trigger BE
              </label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                How many Bottle Equivalents are needed per trigger.
              </div>
              <input
                name="triggerBE"
                type="number"
                min={1}
                step={1}
                defaultValue={6}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
              {actionData?.errors?.triggerBE ? (
                <div style={{ color: "#b42318", marginTop: 6 }}>{actionData.errors.triggerBE}</div>
              ) : null}
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                Amount per trigger (CAD)
              </label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                Fixed amount off the order subtotal per full trigger.
              </div>
              <input
                name="amountPerTrigger"
                type="number"
                min={0}
                step={0.01}
                defaultValue={10}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
              {actionData?.errors?.amountPerTrigger ? (
                <div style={{ color: "#b42318", marginTop: 6 }}>{actionData.errors.amountPerTrigger}</div>
              ) : null}
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                Max discount per order (CAD)
              </label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                Optional cap on the total discount this rule can apply.
              </div>
              <input
                name="maxDiscount"
                type="number"
                min={0}
                step={0.01}
                defaultValue={0}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
              {actionData?.errors?.maxDiscount ? (
                <div style={{ color: "#b42318", marginTop: 6 }}>{actionData.errors.maxDiscount}</div>
              ) : null}
            </div>

            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Create discount
            </button>

            <div style={{ fontSize: 12, color: "#666" }}>
              Function handle: <code>{data.functionHandle}</code>
            </div>
          </div>
        </Form>
      </s-section>

      <s-section heading="Existing Basket Booster discounts">
        {data.discounts?.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {data.discounts.map((d) => (
              <div
                key={d.discountId}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{d.title}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      Status: <b>{d.status}</b>
                      {d.startsAt ? <> · Starts: {new Date(d.startsAt).toLocaleString()}</> : null}
                      {d.endsAt ? <> · Ends: {new Date(d.endsAt).toLocaleString()}</> : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Form method="post">
                      <input type="hidden" name="_action" value={d.status === "ACTIVE" ? "deactivate" : "activate"} />
                      <input type="hidden" name="discountId" value={d.discountId} />
                      <button
                        type="submit"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {d.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                    </Form>

                    <Form method="post" onSubmit={(e) => {
                      if (!confirm("Delete this discount? This cannot be undone.")) e.preventDefault();
                    }}>
                      <input type="hidden" name="_action" value="delete" />
                      <input type="hidden" name="discountId" value={d.discountId} />
                      <button
                        type="submit"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Delete
                      </button>
                    </Form>
                  </div>
                </div>

                <div style={{ fontSize: 12 }}>
                  <div style={{ color: "#666", marginBottom: 4 }}>Config</div>
                  {d.config ? (
                    <pre style={{ margin: 0, padding: 10, borderRadius: 10, background: "#fafafa", overflowX: "auto" }}>
{JSON.stringify(d.config, null, 2)}
                    </pre>
                  ) : (
                    <div style={{ color: "#666" }}>No valid config found (metafield could not be parsed).</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <s-paragraph>No Basket Booster discounts found yet.</s-paragraph>
        )}
      </s-section>

      <s-section heading="Notes">
        <s-paragraph>
          If you change app scopes, reinstall the app so the shop grants the updated permissions.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
