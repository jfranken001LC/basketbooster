export default function Index() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 980, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Basket Booster Discounts</h1>
        <p style={{ marginTop: 8, fontSize: 18 }}>
          Automatically apply an order discount when a cart reaches a configurable Bottle Equivalent (BE) threshold.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Bottle Equivalent logic</h3>
          <p style={{ marginBottom: 0 }}>
            Uses your product metafield <strong>loyalty.bottle_equivalent</strong> to convert mixed bottle sizes into a
            single BE total.
          </p>
        </div>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Scales automatically</h3>
          <p style={{ marginBottom: 0 }}>
            Every <strong>Trigger BE</strong> earns <strong>Amount</strong> off the order subtotal (e.g., 6 BE → $10,
            12 BE → $20, 18 BE → $30).
          </p>
        </div>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Free, simple setup</h3>
          <p style={{ marginBottom: 0 }}>
            Install, set your BE values, create an <strong>Amount off order</strong> discount, and you’re done.
          </p>
        </div>
      </section>

      <section style={{ marginTop: 28, borderTop: "1px solid #eee", paddingTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Open the app</h2>
        <p style={{ marginTop: 6 }}>
          Enter your Shopify store domain to log in and open the embedded admin experience.
        </p>

        {/* Keep this form — it’s how merchants start OAuth in the Shopify scaffold */}
        <form method="post" action="/auth" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="shop" style={{ fontWeight: 600 }}>
            Shop domain
          </label>
          <input
            id="shop"
            name="shop"
            type="text"
            placeholder="your-store.myshopify.com"
            required
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", minWidth: 280 }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Log in
          </button>
        </form>
      </section>

      <footer style={{ marginTop: 36, borderTop: "1px solid #eee", paddingTop: 18, fontSize: 14 }}>
        <a href="/support" style={{ marginRight: 14 }}>
          Support
        </a>
        <a href="/privacy" style={{ marginRight: 14 }}>
          Privacy
        </a>
        <a href="/terms">Terms</a>
      </footer>
    </main>
  );
}
