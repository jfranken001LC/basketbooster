import type { ActionFunctionArgs } from "react-router";
import crypto from "node:crypto";
import db from "../db.server";

function safeBase64ToBuffer(value: string): Buffer | null {
  try {
    return Buffer.from(value, "base64");
  } catch {
    return null;
  }
}

function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  apiSecret: string,
): boolean {
  if (!hmacHeader || !apiSecret) return false;

  const calculated = crypto
    .createHmac("sha256", apiSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const a = safeBase64ToBuffer(calculated);
  const b = safeBase64ToBuffer(hmacHeader.trim());
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // Shopify compliance webhooks must return 401 for invalid HMAC.
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";

  const hmac =
    request.headers.get("X-Shopify-Hmac-Sha256") ??
    request.headers.get("X-Shopify-Hmac-SHA256");

  const topic = request.headers.get("X-Shopify-Topic") ?? "";
  const shop = request.headers.get("X-Shopify-Shop-Domain") ?? "";

  const rawBody = await request.text();

  if (!verifyShopifyWebhookHmac(rawBody, hmac, apiSecret)) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  let payload: unknown = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = {};
    }
  }

  console.log(`[webhooks] topic=${topic} shop=${shop}`);

  switch (topic) {
    case "app/uninstalled": {
      // Remove shop sessions and any persisted shop data
      await db.session.deleteMany({ where: { shop } });
      break;
    }

    case "app/scopes_update": {
      console.log(`[webhooks] scopes_update payload`, payload);
      break;
    }

    case "customers/data_request": {
      console.log(`[webhooks] customers/data_request payload`, payload);
      break;
    }

    case "customers/redact": {
      console.log(`[webhooks] customers/redact payload`, payload);
      break;
    }

    case "shop/redact": {
      // Must erase shop data (at minimum sessions)
      await db.session.deleteMany({ where: { shop } });
      console.log(`[webhooks] shop/redact payload`, payload);
      break;
    }

    default: {
      console.log(`[webhooks] Unhandled topic: ${topic}`);
      break;
    }
  }

  return new Response(null, { status: 200 });
};
