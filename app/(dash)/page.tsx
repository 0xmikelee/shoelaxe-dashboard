import { redirect } from "next/navigation";

/** `/` is not a screen. The approval queue is the product, so the root goes straight there. */
export default function DashIndexPage() {
  redirect("/approvals");
}
