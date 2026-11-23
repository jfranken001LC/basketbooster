import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Shopify React Router v1 layout: authenticate at the parent, and preserve
// Shopify's thrown response headers through its provided error boundary.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Home</Link>
        <Link to="/app/discounts">Discount Manager</Link>
        <Link to="/support">Support</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
      </NavMenu>
      <div style={{ minHeight: "100vh" }}>
        <Outlet />
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
