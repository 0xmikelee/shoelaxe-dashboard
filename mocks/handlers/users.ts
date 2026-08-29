import { z } from "zod";
import { ApiError } from "@/lib/http/errors";
import type { AllowedUserCreateBody } from "@/lib/schemas/params/settings";
import { iso } from "../clock";
import { db } from "../db";
import { projectAllowedUser } from "../project";
import { uuidFrom } from "../random";
import { defineMock, notFound } from "./common";

type CreateBody = z.infer<typeof AllowedUserCreateBody>;
type EmailPath = { email: string };

export const usersHandlers = [
  defineMock("listAllowedUsers", () => ({
    data: db.allowedUsers.map((u) => projectAllowedUser(u, db.me.email)),
  })),

  defineMock<undefined, CreateBody>("createAllowedUser", ({ body }) => {
    const email = body.email.toLowerCase();
    if (db.allowedUsers.some((u) => u.email === email)) {
      // The design's 需有效且未被使用 is exactly this code, not a validation failure.
      throw new ApiError("conflict", "that email is already on the list");
    }
    const user = {
      email,
      name: body.name,
      added_at: iso(Date.now()),
      added_by_name: db.me.name,
      user_id: uuidFrom(`user:${email}`),
    };
    db.allowedUsers.push(user);
    return { data: projectAllowedUser(user, db.me.email) };
  }),

  defineMock<undefined, undefined, EmailPath>("deleteAllowedUser", ({ params }) => {
    const email = params.email.toLowerCase();
    const index = db.allowedUsers.findIndex((u) => u.email === email);
    if (index === -1) notFound(`allowed user ${email}`);
    if (db.allowedUsers.length === 1) {
      // Removing the last row locks everyone out permanently and the seed is a single user.
      throw new ApiError("conflict", "the last allowed user cannot be removed");
    }
    db.allowedUsers.splice(index, 1);
    return { data: { email, remaining_count: db.allowedUsers.length } };
  }),
];
