import { auth } from "@/lib/auth";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401, session: null };
  }
  if (session.user.role !== "ADMIN") {
    return { error: "Forbidden", status: 403, session: null };
  }
  return { error: null, status: 200, session };
}
