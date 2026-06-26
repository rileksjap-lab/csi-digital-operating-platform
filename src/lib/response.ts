import { NextResponse } from "next/server";
import type { ApiError, ApiSuccess, PaginationMeta } from "@/lib/types/api";
import type { ZodError } from "zod";

// ─── Success helpers ──────────────────────────────────────────────────────────

export function ok<T>(data: T, meta?: PaginationMeta | null, status = 200) {
  const body: ApiSuccess<T> = { success: true, data, meta: meta ?? null };
  return NextResponse.json(body, { status });
}

export function created<T>(data: T) {
  return ok(data, null, 201);
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

// ─── Error helpers ────────────────────────────────────────────────────────────

function errorResponse(
  status: number,
  code: string,
  message: string,
  errors?: ApiError["error"]["errors"]
) {
  const body: ApiError = {
    success: false,
    error: { code, message, ...(errors ? { errors } : {}) },
  };
  return NextResponse.json(body, { status });
}

export function badRequest(message: string, errors?: ApiError["error"]["errors"]) {
  return errorResponse(400, "VALIDATION_ERROR", message, errors);
}

export function zodError(err: ZodError) {
  return badRequest(
    "Validation failed",
    err.errors.map((e) => ({ field: e.path.join("."), message: e.message }))
  );
}

export function unauthorized(message = "Authentication required") {
  return errorResponse(401, "UNAUTHENTICATED", message);
}

export function forbidden(message = "Access denied") {
  return errorResponse(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found") {
  return errorResponse(404, "NOT_FOUND", message);
}

export function conflict(message: string) {
  return errorResponse(409, "CONFLICT", message);
}

export function tooManyRequests(retryAfterSeconds: number) {
  const body: ApiError = {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests" },
  };
  return NextResponse.json(body, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

export function notImplemented() {
  return errorResponse(501, "NOT_IMPLEMENTED", "This endpoint is not yet implemented");
}

export function internalError(requestId: string, message = "Internal server error") {
  const body: ApiError = {
    success: false,
    error: { code: "INTERNAL_ERROR", message },
  };
  return NextResponse.json(body, {
    status: 500,
    headers: { "X-Request-Id": requestId },
  });
}
