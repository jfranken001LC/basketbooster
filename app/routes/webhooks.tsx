import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[webhooks] topic=${topic} shop=${shop}`);

  switch (topic) {
    case "app/uninstalled": {
      // Remove shop sessions and any persisted shop data
      await db.session.deleteMany({ where: { shop } });
      break;
    }

    case "app/scopes_update": {
      // Usually just log; Shopify triggers when scopes change
      console.log(`[webhooks] scopes_update payload`, payload);
      break;
    }

    case "customers/data_request": {
      // If you store customer data, you must provide it or initiate retrieval.
      // If you store none, log + 200 is typical.
      console.log(`[webhooks] customers/data_request payload`, payload);
      break;
    }

    case "customers/redact": {
      // If you store customer data, delete/redact it here.
      console.log(`[webhooks] customers/redact payload`, payload);
      break;
    }

    case "shop/redact": {
      // Must erase shop data (at minimum sessions)
      await db.session.deleteMany({ where: { shop } });
      console.log(`[webhooks] shop/redact payload`, payload);
      break;
    }

    default:
      console.log(`[webhooks] Unhandled topic: ${topic}`);
      break;
  }

  return new Response(null, { status: 200 });
};
