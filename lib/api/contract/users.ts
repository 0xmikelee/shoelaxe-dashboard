import type { RouteDoc } from "@/lib/openapi/registry";
import {
  AllowedUserRemovedWire,
  AllowedUserWire,
  AllowedUsersListWire,
} from "@/lib/schemas/wire/users";
import { AllowedUserCreateBody } from "@/lib/schemas/params/settings";
import { AllowedUserEmailPath } from "@/lib/schemas/params/paths";
import { SESSION_ERRORS, WRITE_ERRORS } from "./common";

export const usersContract: RouteDoc[] = [
  {
    operationId: "listAllowedUsers",
    method: "get",
    path: "/api/v1/settings/allowed-users",
    summary: "The allow-list. A session is valid iff its email is on it",
    description:
      "Gap 28 adds the three fields the design does not draw and cannot work without: `added_at`, " +
      "`added_by_name`, and `is_self` so 移除 can be disabled on your own row. At six rows the search " +
      "box filters client-side.",
    tags: ["users"],
    auth: "session",
    consumedBy: "Screen 10 (使用者)",
    response: AllowedUsersListWire,
    errors: [...SESSION_ERRORS],
    idempotency: "Safe.",
  },
  {
    operationId: "createAllowedUser",
    method: "post",
    path: "/api/v1/settings/allowed-users",
    summary: "Grant access to an email address",
    description:
      "No invitation email — creating an allowed user just lets them sign in. A duplicate address is " +
      "`conflict`, which is exactly what the design's 需有效且未被使用 describes.",
    tags: ["users"],
    auth: "session",
    consumedBy: "Screen 10 (新增使用者帳號)",
    request: { body: AllowedUserCreateBody },
    response: AllowedUserWire,
    successStatus: 201,
    errors: [...WRITE_ERRORS, "conflict"],
    idempotency: "Not idempotent; re-adding an existing address is `conflict`.",
    sideEffects: ["allowed_users", "audit_log"],
  },
  {
    operationId: "deleteAllowedUser",
    method: "delete",
    path: "/api/v1/settings/allowed-users/{email}",
    summary: "Revoke access immediately",
    description:
      "The path carries the lowercased, URL-encoded address. **Removing the last remaining user is " +
      "refused with 409** — the seed is a single row, and one careless click would lock everyone out " +
      "permanently with no way back in. Nothing client-side can enforce that, which is why it is here.",
    tags: ["users"],
    auth: "session",
    consumedBy: "Screen 10 (移除)",
    request: { params: AllowedUserEmailPath },
    response: AllowedUserRemovedWire,
    errors: [...SESSION_ERRORS, "not_found", "conflict"],
    idempotency: "A second delete is `not_found`.",
    sideEffects: ["allowed_users", "audit_log"],
  },
];
