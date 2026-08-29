import type { RouteDoc } from "@/lib/openapi/registry";
import {
  GroupApplyAcceptedWire,
  GroupApplyPreviewWire,
  GroupDeleteAcceptedWire,
  GroupDetailWire,
  GroupMembersResultWire,
  GroupsListWire,
} from "@/lib/schemas/wire/groups";
import {
  GroupApplyBody,
  GroupApplyPreviewBody,
  GroupCreateBody,
  GroupMembersBody,
  GroupPatchBody,
} from "@/lib/schemas/params/groups";
import { GroupIdPath } from "@/lib/schemas/params/paths";
import { SESSION_ERRORS, WRITE_ERRORS } from "./common";

export const groupsContract: RouteDoc[] = [
  {
    operationId: "listGroups",
    method: "get",
    path: "/api/v1/groups",
    summary: "Every group with its rule and product count",
    description: "Never empty: 預設分組 cannot be deleted or lose `is_default`.",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 3 (left rail); group pickers on Screens 5 and 7",
    response: GroupsListWire,
    errors: [...SESSION_ERRORS],
    idempotency: "Safe.",
  },
  {
    operationId: "createGroup",
    method: "post",
    path: "/api/v1/groups",
    summary: "新增分組",
    description: "The design has the button but no modal board; the frontend brief defines it (Gap 34).",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 3 (新增分組)",
    request: { body: GroupCreateBody },
    response: GroupDetailWire,
    successStatus: 201,
    errors: [...WRITE_ERRORS, "conflict"],
    idempotency: "Not idempotent; a duplicate name is `conflict`.",
    sideEffects: ["product_groups", "audit_log"],
  },
  {
    operationId: "getGroup",
    method: "get",
    path: "/api/v1/groups/{id}",
    summary: "One group, its rule, and Screen 4's scope counts",
    description:
      "Gap 10. The 96 / 78 / 18 counts must be known before submit and cannot be computed " +
      "client-side — the product table is paginated and per-size data only loads on expand. Two " +
      "invariants hold: `all = group_rule_only + overridden_only`, and `all + ineligible.total = " +
      "listing_count`. Inactive and rejected listings are counted as ineligible, never inside a scope.",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 3 (header); Screen 4 (scope radio); Screen 6 (name + count)",
    request: { params: GroupIdPath },
    response: GroupDetailWire,
    errors: [...SESSION_ERRORS, "not_found"],
    idempotency: "Safe.",
  },
  {
    operationId: "updateGroup",
    method: "patch",
    path: "/api/v1/groups/{id}",
    summary: "Rename a group",
    description:
      "Name only. Every margin change routes through /apply, because changing a rule without saying " +
      "which sizes it overwrites is exactly the ambiguity Screen 4's scope radio exists to remove.",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 3",
    request: { params: GroupIdPath, body: GroupPatchBody },
    response: GroupDetailWire,
    errors: [...WRITE_ERRORS, "not_found", "default_group_immutable", "conflict"],
    idempotency: "Idempotent.",
    sideEffects: ["product_groups", "audit_log"],
  },
  {
    operationId: "deleteGroup",
    method: "delete",
    path: "/api/v1/groups/{id}",
    summary: "Delete a group and reassign its products to 預設分組",
    description:
      "Gap 18: reassignment re-runs §5 for every affected listing, which at 24 products × 8 sizes is " +
      "a fan-out rather than a request — hence 202 and a job, and Screen 6 needs JobProgress too.\n\n" +
      "Gap 14, resolved: a non-empty group is **never refused**, so `group_not_empty` is dead and is " +
      "not in this list.",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 6 (刪除分組確認彈窗)",
    request: { params: GroupIdPath },
    response: GroupDeleteAcceptedWire,
    successStatus: 202,
    errors: [...SESSION_ERRORS, "not_found", "default_group_immutable", "job_already_running", "conflict"],
    idempotency: "A second delete is `not_found`.",
    sideEffects: ["product_groups", "products.product_group_id", "jobs (group_rule_recompute)", "audit_log"],
  },
  {
    operationId: "addGroupMembers",
    method: "post",
    path: "/api/v1/groups/{id}/members",
    summary: "Add products to a group, moving them out of their current one",
    description:
      "Every product is in exactly one group, so adding is moving. The response reports what moved " +
      "and from where, so Screen 5's 將移出 Nike Dunk 系列 warning is confirmed by the server rather " +
      "than inferred. Recomputes with the new group's margins; per Gap 1 that is a human approval and " +
      "bypasses the band.",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 5 (新增產品彈窗)",
    request: { params: GroupIdPath, body: GroupMembersBody },
    response: GroupMembersResultWire,
    errors: [...WRITE_ERRORS, "not_found", "conflict"],
    idempotency: "Adding a product already in the group is a no-op, not an error.",
    sideEffects: ["products.product_group_id", "price_history (分組批次更新)", "audit_log", "shopify_sync_jobs"],
  },
  {
    operationId: "removeGroupMembers",
    method: "delete",
    path: "/api/v1/groups/{id}/members",
    summary: "Remove products from a group, back to 預設分組",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 3 (row action)",
    request: { params: GroupIdPath, body: GroupMembersBody },
    response: GroupMembersResultWire,
    errors: [...WRITE_ERRORS, "not_found", "default_group_immutable", "conflict"],
    idempotency: "Removing a product that is not a member is a no-op.",
    sideEffects: ["products.product_group_id", "price_history (分組批次更新)", "audit_log", "shopify_sync_jobs"],
  },
  {
    operationId: "previewGroupApply",
    method: "post",
    path: "/api/v1/groups/{id}/apply/preview",
    summary: "Screen 4's 預覽 block — a pure read that writes nothing",
    description:
      "Gap 15. 「以成本 HK$1,200 計算 … 目前售價 → 更新後」 needs the margin precedence chain, the " +
      "x49/x99 rounding rule and the per-scope selection, all of which live server-side. POST only " +
      "because it takes a body. The sample cost defaults to the group's median `base_cost` so the " +
      "illustrative figure is explainable rather than arbitrary.",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 4 states A and B",
    request: { params: GroupIdPath, body: GroupApplyPreviewBody },
    response: GroupApplyPreviewWire,
    errors: [...WRITE_ERRORS, "not_found"],
    idempotency: "Safe despite the method: no rows are written.",
  },
  {
    operationId: "applyGroupMargins",
    method: "post",
    path: "/api/v1/groups/{id}/apply",
    summary: "批次更新分組利潤 — 202 and a job",
    description:
      "Field presence *is* the checkbox: an absent margin means 不更新. `all` overwrites size " +
      "overrides, `group_rule_only` skips them, `overridden_only` resets them to the new rule.\n\n" +
      "Five rapid clicks return the **same** job id by design, so a 409 `job_already_running` is not " +
      "an error state — adopt the running job (its id is in `details.job_id`) and switch straight to " +
      "state C. Per Gap 1 the batch bypasses the approval band, writing `price_history` with " +
      "`actor_label='分組批次更新'`.",
    tags: ["groups"],
    auth: "session",
    consumedBy: "Screen 4 (套用)",
    request: { params: GroupIdPath, body: GroupApplyBody },
    response: GroupApplyAcceptedWire,
    successStatus: 202,
    errors: [...WRITE_ERRORS, "not_found", "job_already_running", "conflict"],
    idempotency: "Single-flighted by `jobs_active_scope_unique (kind, scope_key)`.",
    sideEffects: ["jobs (group_apply)", "job_items", "audit_log"],
  },
];
