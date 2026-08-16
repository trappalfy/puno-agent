import { redirect } from "next/navigation";

// The marketing landing page now lives in apps/site (Vite) — this app's own
// / route just forwards into the product. See apps/site's plan for why the
// two are separate apps rather than one: apps/web holds server-only secrets
// (the session secret, the encryption key, the database URL) that a Vite
// bundle can't be trusted with.
export default function RootPage() {
  redirect("/app");
}
