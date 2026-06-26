import { NextResponse } from "next/server";
import pool from "@/lib/db/pool";

// Liveness + readiness probe endpoint (Kubernetes, SAD §14.3).
// Returns 200 if Next.js is up and the database is reachable; 503 otherwise.
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch {
    return NextResponse.json(
      { status: "error", db: "unreachable" },
      { status: 503 }
    );
  }
}
