export default function Index() {
  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <h1 style={styles.h1}>Bottle Equivalent Discounts</h1>
          <p style={styles.tagline}>
            Automatically apply scalable order discounts using your product Bottle Equivalent (BE) metafields — simple,
            configurable, and free.
          </p>
        </header>

        <section style={styles.card}>
          <h2 style={styles.h2}>Log in to your Shopify store</h2>
          <p style={styles.subdued}>
            Enter your store domain (ending in <strong>.myshopify.com</strong>) to install/open the app.
          </p>

          <form method="get" action="/auth" style={styles.form}>
            <label style={styles.label} htmlFor="shop">
              Shop domain
            </label>

            <input
              id="shop"
              name="shop"
              type="text"
              placeholder="e.g., my-shop-domain.myshopify.com"
              autoComplete="off"
              spellCheck={false}
              style={styles.input}
              required
            />

            <button type="submit" style={styles.button}>
              Log in
            </button>
          </form>

          <p style={styles.hint}>
            Troubleshooting? See <a href="/support">Support</a>.
          </p>
        </section>

        <section style={styles.features}>
          <div style={styles.feature}>
            <h3 style={styles.h3}>Bottle-Equivalent logic</h3>
            <p style={styles.p}>
              Discounts are calculated using your <strong>loyalty.bottle_equivalent</strong> integer metafield on each
              product (or variant). Your cart BE total is summed automatically.
            </p>
          </div>

          <div style={styles.feature}>
            <h3 style={styles.h3}>Scales per trigger</h3>
            <p style={styles.p}>
              Set a trigger (e.g., <strong>6 BE</strong>) and an amount (e.g., <strong>$10</strong>). At checkout it
              scales automatically: 6 BE → $10 off, 12 BE → $20 off, 18 BE → $30 off.
            </p>
          </div>

          <div style={styles.feature}>
            <h3 style={styles.h3}>Fast setup in Admin</h3>
            <p style={styles.p}>
              Create an <strong>Amount off order</strong> discount and select{" "}
              <strong>Bottle Equivalent Discount Function</strong>. Configure trigger and amount in the built-in settings
              panel — no coding required.
            </p>
          </div>
        </section>

        <footer style={styles.footer}>
          <div style={styles.footerLinks}>
            <a href="/support" style={styles.footerLink}>Support</a>
            <span style={styles.dot}>•</span>
            <a href="/privacy" style={styles.footerLink}>Privacy</a>
            <span style={styles.dot}>•</span>
            <a href="/terms" style={styles.footerLink}>Terms</a>
          </div>

          <p style={styles.copyright}>
            © {new Date().getFullYear()} Two Men On A Yellow Couch Software
          </p>
        </footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    background: "linear-gradient(180deg, #0b1220 0%, #0d1728 50%, #0b1220 100%)",
    color: "#e8eefc",
    minHeight: "100vh",
    padding: "48px 16px",
  },
  shell: {
    maxWidth: 980,
    margin: "0 auto",
  },
  header: {
    marginBottom: 24,
  },
  h1: {
    margin: 0,
    fontSize: 40,
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
  },
  tagline: {
    marginTop: 12,
    marginBottom: 0,
    fontSize: 18,
    lineHeight: 1.5,
    color: "rgba(232,238,252,0.82)",
    maxWidth: 820,
  },
  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    marginBottom: 22,
  },
  h2: {
    margin: "0 0 6px 0",
    fontSize: 20,
  },
  subdued: {
    margin: "0 0 14px 0",
    color: "rgba(232,238,252,0.75)",
  },
  form: {
    display: "grid",
    gap: 10,
    alignItems: "start",
    gridTemplateColumns: "1fr auto",
  },
  label: {
    gridColumn: "1 / -1",
    fontSize: 13,
    color: "rgba(232,238,252,0.75)",
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    outline: "none",
    background: "rgba(0,0,0,0.22)",
    color: "#e8eefc",
    fontSize: 14,
  },
  button: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.12)",
    color: "#e8eefc",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  hint: {
    margin: "12px 0 0 0",
    fontSize: 13,
    color: "rgba(232,238,252,0.72)",
  },
  features: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    marginBottom: 22,
  },
  feature: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 16,
  },
  h3: {
    margin: "0 0 6px 0",
    fontSize: 16,
  },
  p: {
    margin: 0,
    color: "rgba(232,238,252,0.78)",
    lineHeight: 1.5,
    fontSize: 14,
  },
  footer: {
    marginTop: 10,
    paddingTop: 18,
    borderTop: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(232,238,252,0.65)",
  },
  footerLinks: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  footerLink: {
    color: "rgba(232,238,252,0.75)",
    textDecoration: "none",
  },
  dot: {
    opacity: 0.6,
  },
  copyright: {
    margin: 0,
    fontSize: 12,
    opacity: 0.7,
  },
};
