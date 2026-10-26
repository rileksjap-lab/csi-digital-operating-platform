import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types/api";
import type { Fail } from "@/lib/repositories/kpi-appraisal.repo";

const CODES: Record<Fail["status"], string> = { 400: "VALIDATION_ERROR", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 502: "EMAIL_FAILED" };

/** A refused appraisal action as an API error; the list of what is missing goes in `errors`. */
export function respondFail(f: Fail) {
  const body: ApiError = {
    success: false,
    error: {
      code: CODES[f.status],
      message: f.message,
      ...(f.problems ? { errors: f.problems.map((message) => ({ field: "form", message })) } : {}),
    },
  };
  return NextResponse.json(body, { status: f.status });
}
