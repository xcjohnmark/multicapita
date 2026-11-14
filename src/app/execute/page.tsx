import { redirect } from "next/navigation";

/** The old execution console is now the Swap flow and the Execute panel on each opportunity. */
export default function ExecuteRedirect() {
  redirect("/swap");
}
