import { Link } from "react-router";

export default function Index() {

  return (
    <s-page>
      <s-section heading="Manage Basket Booster discounts">
        <s-paragraph>
          Use <strong>Discount Manager</strong> to create, activate/deactivate, and remove Basket Booster discounts from
          inside the app.
        </s-paragraph>
        <Link to="/app/discounts">Open Discount Manager</Link>
      </s-section>

      <s-section heading="Bottle Equivalent Discounts">
        <s-paragraph>
          Automatically apply scalable order discounts using your product Bottle Equivalent (BE) metafields — simple,
          configurable, and free.
        </s-paragraph>
      </s-section>

      <s-section heading="Quick setup">
        <s-paragraph>
          1) Ensure each product/variant has an integer metafield <strong>loyalty.bottle_equivalent</strong> (for example:
          250&nbsp;mL=1, 500&nbsp;mL=2, 2&nbsp;L tins=4).
        </s-paragraph>
        <s-paragraph>
          2) In Shopify Admin, create a discount and select the{" "}
          <strong>Bottle Equivalent Discount Function</strong>.
        </s-paragraph>
        <s-paragraph>
          3) In the discount settings panel, set your <strong>Trigger BE</strong> (e.g., 6) and{" "}
          <strong>Amount off</strong> (e.g., $10). The discount scales automatically: 6&nbsp;BE → $10, 12&nbsp;BE → $20,
          18&nbsp;BE → $30.
        </s-paragraph>
      </s-section>

      <s-section heading="How it works">
        <s-paragraph>
          The function sums BE values across the cart, calculates how many full triggers are reached, and applies a fixed
          amount off the order subtotal. You can optionally set a maximum cap per order.
        </s-paragraph>
      </s-section>

      <s-section>
        <s-paragraph>
          Need help? Visit <a href="/support">Support</a>. View <a href="/privacy">Privacy</a> and <a href="/terms">Terms</a>.
        </s-paragraph>
      </s-section>

    </s-page>
  );
}
