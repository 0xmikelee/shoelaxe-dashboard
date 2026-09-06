import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import { actorFromSession, ANON_ACTOR } from "@/lib/http/session-auth";

describe("actorFromSession", () => {
  it("returns the anonymous dashboard actor when Supabase is not configured", () => {
    expect(
      actorFromSession({ configured: false, user: null, authError: false }),
    ).toEqual(ANON_ACTOR);
  });

  it("throws unauthenticated when a session is required and missing", () => {
    try {
      actorFromSession({ configured: true, user: null, authError: false });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("unauthenticated");
    }
  });

  it("throws session_expired when the auth client reports an error", () => {
    try {
      actorFromSession({
        configured: true,
        user: { id: "u1", email: "a@b.c" },
        authError: true,
      });
      expect.unreachable();
    } catch (e) {
      expect((e as ApiError).code).toBe("session_expired");
    }
  });

  it("prefers the display name, then email, then a generic label", () => {
    expect(
      actorFromSession({
        configured: true,
        user: { id: "u1", email: "mike@empha.xyz", name: "Mike" },
        authError: false,
      }),
    ).toMatchObject({ id: "u1", email: "mike@empha.xyz", label: "Mike" });

    expect(
      actorFromSession({
        configured: true,
        user: { id: "u1", email: "mike@empha.xyz", name: "  " },
        authError: false,
      }),
    ).toMatchObject({ label: "mike@empha.xyz" });

    expect(
      actorFromSession({
        configured: true,
        user: { id: "u1", email: null, name: null },
        authError: false,
      }),
    ).toMatchObject({ label: "user" });
  });
});
