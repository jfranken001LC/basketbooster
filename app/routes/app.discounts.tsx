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

function toErrorString(err: unknown): string {
  if (!err) return "Unknown error.";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.stack || err.message;
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

/**
 * Run an Admin GraphQL operation and surface GraphQL errors as a thrown Error.
 * This avoids the route crashing with an opaque 500 and instead lets the page
 * render a helpful error message.
 */
async function adminGraphqlJson<TData>(
  admin: any,
  query: string,
  variables?: Record<string, any>
): Promise<TData> {
  const resp = await admin.graphql(query, variables ? { variables } : undefined);

  let json: any;
  try {
    json = await resp.json();
  } catch (e) {
    throw new Error(
      `Admin GraphQL returned a non-JSON response. ${toErrorString(e)}`
    );
  }

  if (json?.errors?.length) {
    const msg = json.errors.map((x: any) => x?.message).filter(Boolean).join("; ");
    throw new Error(msg || "Admin GraphQL returned errors.");
  }

  return json?.data as TData;
}

async function getBeFunction(admin: any) {
  const data = await adminGraphqlJson<{ shopifyFunctions: { nodes: any[] } }>(
    admin,
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
    { first: 50 }
  );

  const nodes = data?.shopifyFunctions?.nodes ?? [];
  const fn =
    nodes.find((n: any) => n?.handle === "be-discount-function") ??
    // Safety net: if handle changed, try matching by title
    nodes.find((n: any) =>
      String(n?.title || "").toLowerCase().includes("bottle equivalent")
    ) ??
    null;

  return {
    functionId: fn?.id as string | undefined,
    functionTitle: fn?.title as string | undefined,
    functionHandle: fn?.handle as string | undefined,
    useCreationUi: Boolean(fn?.useCreationUi),
    apiType: fn?.apiType as string | undefined,
  };
}

async function listBasketBoosterDiscounts(
  admin: any,
  functionId: string
): Promise<DiscountRow[]> {
  // Keep the query filter conservative. Some shops/dev stores can throw errors
  // on unsupported query terms. We filter to app discounts and then match the
  // functionId in code.
  const data = await adminGraphqlJson<{
    discountNodes: {
      nodes: Array<{
        id: string;
        metafield: { value: string | null } | null;
        discount:
          | null
          | {
              __typename: string;
              discountId?: string;
              title?: string;
              status?: string;
              startsAt?: string | null;
              endsAt?: string | null;
              appDiscountType?: { functionId?: string; title?: string } | null;
            };
      }>;
    };
  }>(
    admin,
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
      first: 100,
      query: "type:app",
    }
  );

  const nodes = data?.discountNodes?.nodes ?? [];

  const rows: DiscountRow[] = [];

  for (const n of nodes) {
    const d: any = n?.discount;
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
      discountId: String(d.discountId),
      title: String(d.title || ""),
      status: String(d.status || ""),
      startsAt: d.startsAt ?? null,
      endsAt: d.endsAt ?? null,
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
  let admin: any;

  try {
    const ctx = await authenticate.admin(request);
    // Some versions return the admin object directly, others return { admin }.
    admin = (ctx as any)?.admin ?? ctx;
  } catch (e) {
    // Redirect Responses should keep working as-is.
    if (e instanceof Response) throw e;
    return {
      ok: false,
      error: `Authentication failed: ${toErrorString(e)}`,
      function: null,
      discounts: [] as DiscountRow[],
    };
  }

  try {
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
  } catch (e) {
    return {
      ok: false,
      error: toErrorString(e),
      function: null,
      discounts: [] as DiscountRow[],
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  let admin: any;

  try {
    const ctx = await authenticate.admin(request);
    admin = (ctx as any)?.admin ?? ctx;
  } catch (e) {
    if (e instanceof Response) throw e;
    return { ok: false, error: `Authentication failed: ${toErrorString(e)}` };
  }

  const formData = await request.formData();
  const intent = String(formData.get("_action") || "");

  try {
    const fn = await getBeFunction(admin);
    if (!fn.functionId) {
      return { ok: false, error: "Discount function not found (shopifyFunctions)." };
    }

    if (intent === "create") {
      const title =
        String(formData.get("title") || "").trim() || "Basket Booster discount";
      const triggerBE = intOrNull(formData.get("triggerBE"));
      const amountPerTrigger = numOrNull(formData.get("amountPerTrigger"));
      const maxDiscount = numOrNull(formData.get("maxDiscount"));

      const errors: Record<string, string> = {};
      if (!triggerBE || triggerBE < 1)
        errors.triggerBE = "Trigger BE must be 1 or higher.";
      if (amountPerTrigger === null || amountPerTrigger < 0)
        errors.amountPerTrigger = "Amount per trigger must be 0 or higher.";
      if (maxDiscount === null || maxDiscount < 0)
        errors.maxDiscount = "Max discount must be 0 or higher.";

      if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
      }

      const config: BasketBoosterConfig = {
        triggerBE: triggerBE!,
        amountPerTrigger: amountPerTrigger!,
        maxDiscount: maxDiscount!,
      };

      const data = await adminGraphqlJson<{
        discountAutomaticAppCreate: {
          automaticAppDiscount: { discountId: string; title: string; status: string } | null;
          userErrors: Array<{ field: string[] | null; message: string }>;
        };
      }>(
        admin,
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
        }
      );

      const payload = data?.discountAutomaticAppCreate;
      const userErrors = payload?.userErrors ?? [];

      if (userErrors.length > 0) {
        return {
          ok: false,
          error: userErrors.map((e) => e.message).join("; "),
        };
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

      const key =
        intent === "activate"
          ? "discountAutomaticActivate"
          : intent === "deactivate"
            ? "discountAutomaticDeactivate"
            : "discountAutomaticDelete";

      const data = await adminGraphqlJson<any>(admin, mutation, { id });
      const userErrors = data?.[key]?.userErrors ?? [];

      if (userErrors.length > 0) {
        return { ok: false, error: userErrors.map((e: any) => e.message).join("; ") };
      }

      return { ok: true };
    }

    return { ok: false, error: "Unknown action." };
  } catch (e) {
    return { ok: false, error: toErrorString(e) };
  }
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
          Create and manage your Basket Booster discounts directly from this app.
          Configuration is stored on the discount node as{" "}
          <code>custom/function-configuration</code>.
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

        {data?.ok === false ? (
          <div
            style={{
              margin: "12px 0",
              padding: 12,
              borderRadius: 10,
              background: "#fff4e5",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Discount manager isn’t ready yet.</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{data.error}</div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              If this mentions scopes, ensure your app has <code>read_discounts</code> / <code>write_discounts</code> and reinstall.
            </div>
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
                <div style={{ color: "#b42318", marginTop: 6 }}>
                  {actionData.errors.triggerBE}
                </div>
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
                <div style={{ color: "#b42318", marginTop: 6 }}>
                  {actionData.errors.amountPerTrigger}
                </div>
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
                <div style={{ color: "#b42318", marginTop: 6 }}>
                  {actionData.errors.maxDiscount}
                </div>
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
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                    Title
                  </th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                    Status
                  </th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                    Trigger
                  </th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                    Amount
                  </th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                    Cap
                  </th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                    Actions
                  </th>
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
