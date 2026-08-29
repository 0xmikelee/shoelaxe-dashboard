import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * The Node interceptor, for vitest. `tests/setup/msw.ts` owns the lifecycle — listen, reset, close —
 * so a test file only ever imports `server` to add a one-off override with `server.use(...)`.
 */
export const server = setupServer(...handlers);

export { handlers };
