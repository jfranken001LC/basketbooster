import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
import { json } from "@remix-run/node";
import type { LinksFunction } from "@remix-run/node";

import { authenticate } from "../shopify.server";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://cdn.shopify.com/" },
  {
    rel: "stylesheet",
    href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css",
  },
];

export const loader = async ({ request }: { request: Request }) => {
  // If not authenticated, this will redirect through OAuth / session-token flow as needed.
  await authenticate.admin(request);

  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const appUrl = process.env.SHOPIFY_APP_URL ?? "";

  return json({
    apiKey,
    appUrl,
  });
};

export default function App() {
  const { apiKey, appUrl } = useLoaderData<typeof loader>();

  // If the API key is missing/mismatched, App Bridge init can fail and appear as a blank screen.
  // Render an explicit diagnostic instead.
  if (!apiKey) {
    return (
      <html lang="en">
        <head>
          <Meta />
          <Links />
        </head>
        <body style={{ fontFamily: "Inter, system-ui, Arial", padding: 24 }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>
            BasketBooster: Missing SHOPIFY_API_KEY
          </h1>

          <p style={{ marginBottom: 12, lineHeight: 1.4 }}>
            Your embedded app loaded, but <code>process.env.SHOPIFY_API_KEY</code>{" "}
            is empty on the server.
          </p>

          <ul style={{ lineHeight: 1.6 }}>
            <li>
              In <b>Shopify Partners</b> → App → <b>Settings</b>, copy the <b>Client ID</b>
              and set it as <code>SHOPIFY_API_KEY</code> in your server environment.
            </li>
            <li>
              Ensure the app you open in the store admin matches that Client ID:
              the admin URL will include <code>/apps/&lt;client_id&gt;</code>.
            </li>
          </ul>

          {appUrl ? (
            <p style={{ marginTop: 12 }}>
              Current <code>SHOPIFY_APP_URL</code>: <code>{appUrl}</code>
            </p>
          ) : null}

          <Scripts />
        </body>
      </html>
    );
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">
          Home
        </a>
        <a href="/app/additional">Additional page</a>
      </NavMenu>

      <Outlet />
    </AppProvider>
  );
}

// Shopify error boundary (kept)
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = boundary.headers;
