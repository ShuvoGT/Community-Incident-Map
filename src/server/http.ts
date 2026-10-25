import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "./services/auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Maps thrown errors to safe HTTP responses. Never leaks internals to clients.
export function handleError(e: unknown) {
  if (e instanceof UnauthorizedError) return error("Authentication required", 401);
  if (e instanceof ForbiddenError) return error("Forbidden", 403);
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: e.flatten() },
      { status: 400 },
    );
  }
  console.error(e);
  return error("Something went wrong", 500);
}
