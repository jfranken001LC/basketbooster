import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

type BasketBoosterConfig = {
  triggerBE: number;
  amountPerTrigger: number;
  maxDiscount: number;
};

type DiscountRow = {
  discountNodeId: string;
  discountId: string;
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

async function getBeFunction(admin: any) {
  const resp = await admin.graphql(
    `#graphql
    query GetFunctions($first: Int!) {
      shopifyFunctions(first: $first) {
        nodes {
          id
          handle
          title
          apiType
          useCreationUi
        }
      }
    }`,
    { variables: { first: 50 } }
  );

  const json = await resp.json();
  const nodes = json?.data?.shopifyFunctions?.nodes ?? [];
  const fn = nodes.find((n: any) => n?.handle === "be-discount-function") ?? null;

  return {
    functionId: fn?.id as string | undefined,
    functionTitle: fn?.title as string | undefined,
    functionHandle: fn?.handle as string | undefined,
    useCreationUi: Boolean(fn?.useCreationUi),
    apiType: fn?.apiType as string | undefined,
  };
}

async function listBasketBoosterDiscounts(admin: any, functionId: string): Promise<DiscountRow[]> {
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
                functionId
                title
              }
            }
          }
        }
      }
    }`,
    {
      variables: {
        first: 100,
        query: "type:app AND method:automatic",
      },
    }
  );

  const json = await resp.json();
  const nodes = json?.data?.discountNodes?.nodes ?? [];

  const rows: DiscountRow[] = [];

  for (const n of nodes) {
    const d = n?.discount;
    if (!d || d.__typename !== "DiscountAutomaticApp") continue;

    const fnId = d?.appDiscountType?.functionId;
    if (!fnId || fnId !== functionId) continue;

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

  const fn = await getBeFunction(admin);

  if (!fn.functionId) {
    return {
      ok: false,
      error:
        "Could not find the Basket Booster discount function on this shop. Verify the app is installed and the function extension is registered (shopifyFunctions).",
      function: fn,
      discounts: [] as DiscountRow[],
    };
  }

  const discounts = await listBasketBoosterDiscounts(admin, fn.functionId);

  return {
    ok: true,
    function: fn,
    discounts,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("_action") || "");

  const fn = await getBeFunction(admin);
  if (!fn.functionId) {
    return { ok: false, error: "Discount function not found (shopifyFunctions)." };
  }

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
            functionId: fn.functionId,
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
                Maximum discount per order (CAD)
              </label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                0 means no cap.
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

            <s-button type="submit">Create discount</s-button>
          </div>
        </Form>
      </s-section>

      <s-section heading="Existing Basket Booster discounts">
        {data?.discounts?.length ? (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                minWidth: 760,
                fontFamily: "system-ui",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Title</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Status</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Trigger</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Amount</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Cap</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.discounts.map((d) => (
                  <tr key={d.discountId}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{d.title}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{d.status}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      {d.config ? d.config.triggerBE : "—"}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      {d.config ? `$${d.config.amountPerTrigger.toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      {d.config ? `$${d.config.maxDiscount.toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {d.status !== "ACTIVE" ? (
                          <Form method="post">
                            <input type="hidden" name="_action" value="activate" />
                            <input type="hidden" name="discountId" value={d.discountId} />
                            <s-button type="submit">Activate</s-button>
                          </Form>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="_action" value="deactivate" />
                            <input type="hidden" name="discountId" value={d.discountId} />
                            <s-button type="submit">Deactivate</s-button>
                          </Form>
                        )}

                        <Form method="post">
                          <input type="hidden" name="_action" value="delete" />
                          <input type="hidden" name="discountId" value={d.discountId} />
                          <s-button type="submit">Delete</s-button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <s-paragraph>No Basket Booster discounts found yet.</s-paragraph>
        )}
      </s-section>
    </s-page>
  );
}
