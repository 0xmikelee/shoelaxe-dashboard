import type { RouteDoc } from "@/lib/openapi/registry";
import { MeWire } from "@/lib/schemas/wire/me";

export const meContract: RouteDoc[] = [
  {
    operationId: "getMe",
    method: "get",
    path: "/api/v1/me",
    summary: "The signed-in user, plus publishing state and a settings snapshot",
    description:
      "Read once in the dashboard layout and seeded into context. Reading `publishing.enabled` " +
      "from each screen's own list query would render sync copy for the ~200ms before it resolves.",
    tags: ["auth"],
    auth: "session",
    consumedBy: "Shell (nav, publishing banner); Screens 2, 3, 4, 8 for formula previews",
    response: MeWire,
    errors: ["unauthenticated", "session_expired", "not_allowed", "internal_error", "service_unavailable"],
    idempotency: "Safe; cached for the session.",
  },
];
