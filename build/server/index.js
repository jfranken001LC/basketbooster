var _a;
import { jsx, jsxs } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useActionData, Form, UNSAFE_withErrorBoundaryProps, useRouteError } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.October25;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        ServerRouter,
        {
          context: reactRouterContext,
          url: request.url
        }
      ),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width,initial-scale=1"
      }), /* @__PURE__ */ jsx("link", {
        rel: "preconnect",
        href: "https://cdn.shopify.com/"
      }), /* @__PURE__ */ jsx("link", {
        rel: "stylesheet",
        href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root
}, Symbol.toStringTag, { value: "Module" }));
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$2 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const action$1 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const route$1 = UNSAFE_withComponentProps(function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const {
    errors
  } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider, {
    embedded: false,
    children: /* @__PURE__ */ jsx("s-page", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-section", {
          heading: "Log in",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onChange: (e) => setShop(e.currentTarget.value),
            autocomplete: "on",
            error: errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: route$1,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const action = async ({
  request
}) => {
  const {
    shop,
    topic,
    payload
  } = await authenticate.webhook(request);
  console.log(`[webhooks] topic=${topic} shop=${shop}`);
  switch (topic) {
    case "app/uninstalled": {
      await prisma.session.deleteMany({
        where: {
          shop
        }
      });
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
      await prisma.session.deleteMany({
        where: {
          shop
        }
      });
      console.log(`[webhooks] shop/redact payload`, payload);
      break;
    }
    default:
      console.log(`[webhooks] Unhandled topic: ${topic}`);
      break;
  }
  return new Response(null, {
    status: 200
  });
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action
}, Symbol.toStringTag, { value: "Module" }));
const privacy = UNSAFE_withComponentProps(function Privacy() {
  return /* @__PURE__ */ jsxs("main", {
    style: {
      fontFamily: "system-ui",
      padding: 24,
      maxWidth: 900,
      margin: "0 auto"
    },
    children: [/* @__PURE__ */ jsx("h1", {
      children: "Basket Booster Discounts — Privacy Policy"
    }), /* @__PURE__ */ jsx("p", {
      children: "Basket Booster Discounts is provided by Two Men On A Yellow Couch Software. This app is designed to apply order discounts based on Bottle Equivalent (BE) metafields set on products or variants in a Shopify store."
    }), /* @__PURE__ */ jsx("h2", {
      children: "Data collection"
    }), /* @__PURE__ */ jsx("p", {
      children: "This app does not store customer personal information in an external database. The discount calculation runs in Shopify’s checkout environment using Shopify Functions."
    }), /* @__PURE__ */ jsx("h2", {
      children: "Webhooks & compliance"
    }), /* @__PURE__ */ jsx("p", {
      children: "To comply with Shopify’s platform requirements, the app supports Shopify’s required privacy webhooks: customers/data_request, customers/redact, and shop/redact."
    }), /* @__PURE__ */ jsx("h2", {
      children: "Contact"
    }), /* @__PURE__ */ jsxs("p", {
      children: ["If you have questions about this policy, contact", " ", /* @__PURE__ */ jsx("a", {
        href: "mailto:Support@TwoMenOnAYellowCouch.com",
        children: "Support@TwoMenOnAYellowCouch.com"
      }), "."]
    })]
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: privacy
}, Symbol.toStringTag, { value: "Module" }));
const support = UNSAFE_withComponentProps(function Support() {
  return /* @__PURE__ */ jsxs("main", {
    style: {
      fontFamily: "system-ui",
      padding: 24,
      maxWidth: 900,
      margin: "0 auto"
    },
    children: [/* @__PURE__ */ jsx("h1", {
      children: "Basket Booster Discounts — Support"
    }), /* @__PURE__ */ jsxs("p", {
      children: ["For support, please email", " ", /* @__PURE__ */ jsx("a", {
        href: "mailto:Support@TwoMenOnAYellowCouch.com",
        children: "Support@TwoMenOnAYellowCouch.com"
      }), "."]
    }), /* @__PURE__ */ jsx("h2", {
      children: "How it works"
    }), /* @__PURE__ */ jsxs("p", {
      children: ["This app applies a fixed amount off the order subtotal for every ", /* @__PURE__ */ jsx("strong", {
        children: "N"
      }), " Bottle Equivalents (BE) found in the cart."]
    }), /* @__PURE__ */ jsx("h2", {
      children: "Setup checklist"
    }), /* @__PURE__ */ jsxs("ol", {
      children: [/* @__PURE__ */ jsxs("li", {
        children: ["In Shopify Admin, ensure you have a product metafield definition:", /* @__PURE__ */ jsx("strong", {
          children: " loyalty.bottle_equivalent"
        }), " (Integer)."]
      }), /* @__PURE__ */ jsxs("li", {
        children: ["Set BE values on products (or variants). Recommended mapping for a 250ml base:", /* @__PURE__ */ jsx("strong", {
          children: " 250ml=1"
        }), ", ", /* @__PURE__ */ jsx("strong", {
          children: "500ml=2"
        }), ", ", /* @__PURE__ */ jsx("strong", {
          children: "2L=4"
        }), "."]
      }), /* @__PURE__ */ jsxs("li", {
        children: ["Create an ", /* @__PURE__ */ jsx("strong", {
          children: "Amount off order"
        }), " discount and choose the app function:", /* @__PURE__ */ jsx("strong", {
          children: " Bottle Equivalent Discount Function"
        }), "."]
      }), /* @__PURE__ */ jsx("li", {
        children: "Configure Trigger BE, Amount per trigger, and (optionally) a maximum discount cap. Save and test in checkout."
      })]
    }), /* @__PURE__ */ jsx("h2", {
      children: "Common issues"
    }), /* @__PURE__ */ jsxs("ul", {
      children: [/* @__PURE__ */ jsxs("li", {
        children: ["If you created a ", /* @__PURE__ */ jsx("strong", {
          children: "shipping"
        }), " discount, Shopify will say the function doesn’t support it. Create an", " ", /* @__PURE__ */ jsx("strong", {
          children: "Amount off order"
        }), " discount instead."]
      }), /* @__PURE__ */ jsx("li", {
        children: "If no discount applies, confirm the product metafield has a numeric BE value and your trigger threshold is met."
      })]
    })]
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: support
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const headers$1 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  headers: headers$1,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const route = UNSAFE_withComponentProps(function Index() {
  return /* @__PURE__ */ jsxs("main", {
    style: {
      fontFamily: "system-ui",
      padding: 32,
      maxWidth: 980,
      margin: "0 auto"
    },
    children: [/* @__PURE__ */ jsxs("header", {
      style: {
        marginBottom: 24
      },
      children: [/* @__PURE__ */ jsx("h1", {
        style: {
          margin: 0
        },
        children: "Basket Booster Discounts"
      }), /* @__PURE__ */ jsx("p", {
        style: {
          marginTop: 8,
          fontSize: 18
        },
        children: "Automatically apply an order discount when a cart reaches a configurable Bottle Equivalent (BE) threshold."
      })]
    }), /* @__PURE__ */ jsxs("section", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 16
      },
      children: [/* @__PURE__ */ jsxs("div", {
        style: {
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16
        },
        children: [/* @__PURE__ */ jsx("h3", {
          style: {
            marginTop: 0
          },
          children: "Bottle Equivalent logic"
        }), /* @__PURE__ */ jsxs("p", {
          style: {
            marginBottom: 0
          },
          children: ["Uses your product metafield ", /* @__PURE__ */ jsx("strong", {
            children: "loyalty.bottle_equivalent"
          }), " to convert mixed bottle sizes into a single BE total."]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: {
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16
        },
        children: [/* @__PURE__ */ jsx("h3", {
          style: {
            marginTop: 0
          },
          children: "Scales automatically"
        }), /* @__PURE__ */ jsxs("p", {
          style: {
            marginBottom: 0
          },
          children: ["Every ", /* @__PURE__ */ jsx("strong", {
            children: "Trigger BE"
          }), " earns ", /* @__PURE__ */ jsx("strong", {
            children: "Amount"
          }), " off the order subtotal (e.g., 6 BE → $10, 12 BE → $20, 18 BE → $30)."]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: {
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16
        },
        children: [/* @__PURE__ */ jsx("h3", {
          style: {
            marginTop: 0
          },
          children: "Free, simple setup"
        }), /* @__PURE__ */ jsxs("p", {
          style: {
            marginBottom: 0
          },
          children: ["Install, set your BE values, create an ", /* @__PURE__ */ jsx("strong", {
            children: "Amount off order"
          }), " discount, and you’re done."]
        })]
      })]
    }), /* @__PURE__ */ jsxs("section", {
      style: {
        marginTop: 28,
        borderTop: "1px solid #eee",
        paddingTop: 20
      },
      children: [/* @__PURE__ */ jsx("h2", {
        style: {
          marginTop: 0
        },
        children: "Open the app"
      }), /* @__PURE__ */ jsx("p", {
        style: {
          marginTop: 6
        },
        children: "Enter your Shopify store domain to log in and open the embedded admin experience."
      }), /* @__PURE__ */ jsxs("form", {
        method: "post",
        action: "/auth",
        style: {
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap"
        },
        children: [/* @__PURE__ */ jsx("label", {
          htmlFor: "shop",
          style: {
            fontWeight: 600
          },
          children: "Shop domain"
        }), /* @__PURE__ */ jsx("input", {
          id: "shop",
          name: "shop",
          type: "text",
          placeholder: "your-store.myshopify.com",
          required: true,
          style: {
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            minWidth: 280
          }
        }), /* @__PURE__ */ jsx("button", {
          type: "submit",
          style: {
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer"
          },
          children: "Log in"
        })]
      })]
    }), /* @__PURE__ */ jsxs("footer", {
      style: {
        marginTop: 36,
        borderTop: "1px solid #eee",
        paddingTop: 18,
        fontSize: 14
      },
      children: [/* @__PURE__ */ jsx("a", {
        href: "/support",
        style: {
          marginRight: 14
        },
        children: "Support"
      }), /* @__PURE__ */ jsx("a", {
        href: "/privacy",
        style: {
          marginRight: 14
        },
        children: "Privacy"
      }), /* @__PURE__ */ jsx("a", {
        href: "/terms",
        children: "Terms"
      })]
    })]
  });
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route
}, Symbol.toStringTag, { value: "Module" }));
const terms = UNSAFE_withComponentProps(function Terms() {
  return /* @__PURE__ */ jsxs("main", {
    style: {
      fontFamily: "system-ui",
      padding: 24,
      maxWidth: 900,
      margin: "0 auto"
    },
    children: [/* @__PURE__ */ jsx("h1", {
      children: "Basket Booster Discounts — Terms of Service"
    }), /* @__PURE__ */ jsx("p", {
      children: "By installing and using Basket Booster Discounts, you agree to these terms. This app is provided “as is” without warranty. You are responsible for verifying discount rules and testing promotions before using them in production."
    }), /* @__PURE__ */ jsx("h2", {
      children: "Service description"
    }), /* @__PURE__ */ jsx("p", {
      children: "The app applies a fixed-amount discount to the order subtotal when the cart reaches a configured Bottle Equivalent (BE) threshold."
    }), /* @__PURE__ */ jsx("h2", {
      children: "Support"
    }), /* @__PURE__ */ jsxs("p", {
      children: ["Support is available by email at", " ", /* @__PURE__ */ jsx("a", {
        href: "mailto:Support@TwoMenOnAYellowCouch.com",
        children: "Support@TwoMenOnAYellowCouch.com"
      }), "."]
    })]
  });
});
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: terms
}, Symbol.toStringTag, { value: "Module" }));
const loader = async ({
  request
}) => {
  await authenticate.admin(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || ""
  };
};
const app = UNSAFE_withComponentProps(function App2() {
  const {
    apiKey
  } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider, {
    embedded: true,
    apiKey,
    children: [/* @__PURE__ */ jsxs("s-app-nav", {
      children: [/* @__PURE__ */ jsx("s-link", {
        href: "/app",
        children: "Home"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/additional",
        children: "Additional page"
      })]
    }), /* @__PURE__ */ jsx(Outlet, {})]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(useRouteError());
});
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const app_additional = UNSAFE_withComponentProps(function AdditionalPage() {
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Additional page",
    children: [/* @__PURE__ */ jsxs("s-section", {
      heading: "Multiple pages",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: ["The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using", " ", /* @__PURE__ */ jsx("s-link", {
          href: "https://shopify.dev/docs/apps/tools/app-bridge",
          target: "_blank",
          children: "App Bridge"
        }), "."]
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["To create your own page and have it show up in the app navigation, add a page inside ", /* @__PURE__ */ jsx("code", {
          children: "app/routes"
        }), ", and a link to it in the", " ", /* @__PURE__ */ jsx("code", {
          children: "<ui-nav-menu>"
        }), " component found in", " ", /* @__PURE__ */ jsx("code", {
          children: "app/routes/app.jsx"
        }), "."]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      slot: "aside",
      heading: "Resources",
      children: /* @__PURE__ */ jsx("s-unordered-list", {
        children: /* @__PURE__ */ jsx("s-list-item", {
          children: /* @__PURE__ */ jsx("s-link", {
            href: "https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav",
            target: "_blank",
            children: "App nav best practices"
          })
        })
      })
    })]
  });
});
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
const app__index = UNSAFE_withComponentProps(function Index2() {
  return /* @__PURE__ */ jsx("main", {
    style: styles.page,
    children: /* @__PURE__ */ jsxs("div", {
      style: styles.shell,
      children: [/* @__PURE__ */ jsxs("header", {
        style: styles.header,
        children: [/* @__PURE__ */ jsx("h1", {
          style: styles.h1,
          children: "Bottle Equivalent Discounts"
        }), /* @__PURE__ */ jsx("p", {
          style: styles.tagline,
          children: "Automatically apply scalable order discounts using your product Bottle Equivalent (BE) metafields — simple, configurable, and free."
        })]
      }), /* @__PURE__ */ jsxs("section", {
        style: styles.card,
        children: [/* @__PURE__ */ jsx("h2", {
          style: styles.h2,
          children: "Log in to your Shopify store"
        }), /* @__PURE__ */ jsxs("p", {
          style: styles.subdued,
          children: ["Enter your store domain (ending in ", /* @__PURE__ */ jsx("strong", {
            children: ".myshopify.com"
          }), ") to install/open the app."]
        }), /* @__PURE__ */ jsxs("form", {
          method: "get",
          action: "/auth",
          style: styles.form,
          children: [/* @__PURE__ */ jsx("label", {
            style: styles.label,
            htmlFor: "shop",
            children: "Shop domain"
          }), /* @__PURE__ */ jsx("input", {
            id: "shop",
            name: "shop",
            type: "text",
            placeholder: "e.g., my-shop-domain.myshopify.com",
            autoComplete: "off",
            spellCheck: false,
            style: styles.input,
            required: true
          }), /* @__PURE__ */ jsx("button", {
            type: "submit",
            style: styles.button,
            children: "Log in"
          })]
        }), /* @__PURE__ */ jsxs("p", {
          style: styles.hint,
          children: ["Troubleshooting? See ", /* @__PURE__ */ jsx("a", {
            href: "/support",
            children: "Support"
          }), "."]
        })]
      }), /* @__PURE__ */ jsxs("section", {
        style: styles.features,
        children: [/* @__PURE__ */ jsxs("div", {
          style: styles.feature,
          children: [/* @__PURE__ */ jsx("h3", {
            style: styles.h3,
            children: "Bottle-Equivalent logic"
          }), /* @__PURE__ */ jsxs("p", {
            style: styles.p,
            children: ["Discounts are calculated using your ", /* @__PURE__ */ jsx("strong", {
              children: "loyalty.bottle_equivalent"
            }), " integer metafield on each product (or variant). Your cart BE total is summed automatically."]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles.feature,
          children: [/* @__PURE__ */ jsx("h3", {
            style: styles.h3,
            children: "Scales per trigger"
          }), /* @__PURE__ */ jsxs("p", {
            style: styles.p,
            children: ["Set a trigger (e.g., ", /* @__PURE__ */ jsx("strong", {
              children: "6 BE"
            }), ") and an amount (e.g., ", /* @__PURE__ */ jsx("strong", {
              children: "$10"
            }), "). At checkout it scales automatically: 6 BE → $10 off, 12 BE → $20 off, 18 BE → $30 off."]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          style: styles.feature,
          children: [/* @__PURE__ */ jsx("h3", {
            style: styles.h3,
            children: "Fast setup in Admin"
          }), /* @__PURE__ */ jsxs("p", {
            style: styles.p,
            children: ["Create an ", /* @__PURE__ */ jsx("strong", {
              children: "Amount off order"
            }), " discount and select", " ", /* @__PURE__ */ jsx("strong", {
              children: "Bottle Equivalent Discount Function"
            }), ". Configure trigger and amount in the built-in settings panel — no coding required."]
          })]
        })]
      }), /* @__PURE__ */ jsxs("footer", {
        style: styles.footer,
        children: [/* @__PURE__ */ jsxs("div", {
          style: styles.footerLinks,
          children: [/* @__PURE__ */ jsx("a", {
            href: "/support",
            style: styles.footerLink,
            children: "Support"
          }), /* @__PURE__ */ jsx("span", {
            style: styles.dot,
            children: "•"
          }), /* @__PURE__ */ jsx("a", {
            href: "/privacy",
            style: styles.footerLink,
            children: "Privacy"
          }), /* @__PURE__ */ jsx("span", {
            style: styles.dot,
            children: "•"
          }), /* @__PURE__ */ jsx("a", {
            href: "/terms",
            style: styles.footerLink,
            children: "Terms"
          })]
        }), /* @__PURE__ */ jsxs("p", {
          style: styles.copyright,
          children: ["© ", (/* @__PURE__ */ new Date()).getFullYear(), " Two Men On A Yellow Couch Software"]
        })]
      })]
    })
  });
});
const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    background: "linear-gradient(180deg, #0b1220 0%, #0d1728 50%, #0b1220 100%)",
    color: "#e8eefc",
    minHeight: "100vh",
    padding: "48px 16px"
  },
  shell: {
    maxWidth: 980,
    margin: "0 auto"
  },
  header: {
    marginBottom: 24
  },
  h1: {
    margin: 0,
    fontSize: 40,
    lineHeight: 1.1,
    letterSpacing: "-0.02em"
  },
  tagline: {
    marginTop: 12,
    marginBottom: 0,
    fontSize: 18,
    lineHeight: 1.5,
    color: "rgba(232,238,252,0.82)",
    maxWidth: 820
  },
  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    marginBottom: 22
  },
  h2: {
    margin: "0 0 6px 0",
    fontSize: 20
  },
  subdued: {
    margin: "0 0 14px 0",
    color: "rgba(232,238,252,0.75)"
  },
  form: {
    display: "grid",
    gap: 10,
    alignItems: "start",
    gridTemplateColumns: "1fr auto"
  },
  label: {
    gridColumn: "1 / -1",
    fontSize: 13,
    color: "rgba(232,238,252,0.75)"
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    outline: "none",
    background: "rgba(0,0,0,0.22)",
    color: "#e8eefc",
    fontSize: 14
  },
  button: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.12)",
    color: "#e8eefc",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap"
  },
  hint: {
    margin: "12px 0 0 0",
    fontSize: 13,
    color: "rgba(232,238,252,0.72)"
  },
  features: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    marginBottom: 22
  },
  feature: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 16
  },
  h3: {
    margin: "0 0 6px 0",
    fontSize: 16
  },
  p: {
    margin: 0,
    color: "rgba(232,238,252,0.78)",
    lineHeight: 1.5,
    fontSize: 14
  },
  footer: {
    marginTop: 10,
    paddingTop: 18,
    borderTop: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(232,238,252,0.65)"
  },
  footerLinks: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 10
  },
  footerLink: {
    color: "rgba(232,238,252,0.75)",
    textDecoration: "none"
  },
  dot: {
    opacity: 0.6
  },
  copyright: {
    margin: 0,
    fontSize: 12,
    opacity: 0.7
  }
};
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app__index
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-BE7jTlyz.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/root-FG0ihWjQ.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-UGU9wWet.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js", "/assets/AppProxyProvider-imGH-Btw.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks": { "id": "routes/webhooks", "parentId": "root", "path": "webhooks", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/privacy": { "id": "routes/privacy", "parentId": "root", "path": "privacy", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/privacy-CxpWYStn.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/support": { "id": "routes/support", "parentId": "root", "path": "support", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/support-KXYuNp9z.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-CHU4JDZt.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/terms": { "id": "routes/terms", "parentId": "root", "path": "terms", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/terms-Es8wX2I_.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/app-xyBAaiWm.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js", "/assets/AppProxyProvider-imGH-Btw.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.additional-DJbirWVP.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app._index-B8yJGqou.js", "imports": ["/assets/chunk-JZWAC4HX-DiKPbb3w.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-5e62b076.js", "version": "5e62b076", "sri": void 0 };
const assetsBuildDirectory = "build\\client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "unstable_subResourceIntegrity": false, "unstable_trailingSlashAwareDataRequests": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks": {
    id: "routes/webhooks",
    parentId: "root",
    path: "webhooks",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/privacy": {
    id: "routes/privacy",
    parentId: "root",
    path: "privacy",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/support": {
    id: "routes/support",
    parentId: "root",
    path: "support",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route6
  },
  "routes/terms": {
    id: "routes/terms",
    parentId: "root",
    path: "terms",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route10
  }
};
const allowedActionOrigins = false;
export {
  allowedActionOrigins,
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
