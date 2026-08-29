import { toast } from "sonner";

import { requestIdOf } from "@/lib/api/errors";
import { errorCopy } from "@/lib/i18n/errors";
import { zhHant } from "@/lib/i18n/zh-Hant";

/** Every failure the user did not cause at a field. Surfaces `request_id` so it can be quoted. */
export function toastApiError(error: unknown): void {
  const copy = errorCopy(error);
  const requestId = requestIdOf(error);
  toast.error(copy.message, {
    description: requestId ? zhHant.common.requestId(requestId) : undefined,
  });
}

export function toastSuccess(message: string): void {
  toast.success(message);
}

/** An outcome the user should see, but not as a failure — `not_pending` is the usual case. */
export function toastNotice(message: string): void {
  toast(message);
}
