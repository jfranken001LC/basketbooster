import Support from "./support";

/**
 * Embedded wrapper for the public Support page.
 * This keeps navigation within /app/* so App Bridge routing stays stable.
 */
export default function AppSupport() {
  return <Support />;
}
