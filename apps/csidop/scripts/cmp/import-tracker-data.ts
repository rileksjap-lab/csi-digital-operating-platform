/**
 * One-time import of the real tracker dataset (198 tracking items across
 * 11 workstreams, all verified per-level-weight-valid) from
 * documents/cmp_import_data.json (produced by parsing
 * 01_PLAN_SETUP in CSI_CMP_Master_Tracker_v1.2_Execution_Ready_CSIDOP.xlsx)
 * into a target plan, via the real API -- not direct DB writes -- so it
 * exercises the same validation/audit path a human using the UI would.
 *
 * Requires the dev server running (npm --prefix apps/csidop run dev) and
 * dev-bypass auth available (NODE_ENV=development, no OIDC_CLIENT_ID).
 * Authenticates itself via GET /api/auth/login the same way the "Dev
 * Login" button does, capturing the session cookie for every subsequent
 * request -- it does not reuse a browser's existing session.
 *
 *   node scripts/cmp/import-tracker-data.ts <planId> [baseUrl]
 *
 * planId must already exist (Draft status) and currently have zero
 * workstreams -- this script does not delete or overwrite anything, and
 * will fail loudly on a 409/403 rather than silently skip.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface ImportItem {
  itemCode: string;
  name: string;
  weight: number;
  method: string;
  criticalGate: boolean;
  evidenceRequired: boolean;
  owner: string;
  start: string | null;
  target: string | null;
}
interface ImportFactor {
  name: string;
  weight: number;
  items: ImportItem[];
}
interface ImportInitiative {
  name: string;
  weight: number;
  factors: Record<string, ImportFactor>;
}
interface ImportWorkstream {
  name: string;
  weight: number;
  initiatives: Record<string, ImportInitiative>;
}

const planId = process.argv[2];
const baseUrl = process.argv[3] ?? "http://localhost:3001";
if (!planId) {
  console.error("Usage: node scripts/cmp/import-tracker-data.ts <planId> [baseUrl]");
  process.exit(1);
}

const dataPath = join(import.meta.dirname, "..", "..", "..", "..", "documents", "cmp_import_data.json");
const workstreams: Record<string, ImportWorkstream> = JSON.parse(readFileSync(dataPath, "utf8"));

let cookie = "";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) {
    // dev-login redirect -- not an error for that one call
  } else if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  const json = await res.json().catch(() => null);
  if (json && json.success === false) {
    throw new Error(`${method} ${path} -> ${JSON.stringify(json.error)}`);
  }
  return json?.data as T;
}

async function login(): Promise<void> {
  const res = await fetch(`${baseUrl}/api/auth/login`, { redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Dev login did not return a session cookie -- is the dev server running with dev-bypass auth enabled?");
  cookie = setCookie.split(";")[0];
  console.log("Authenticated (dev-bypass).");
}

async function main() {
  await login();

  let wsCount = 0, initCount = 0, facCount = 0, itemCount = 0;
  let wsSortOrder = 0;

  for (const [wsCode, ws] of Object.entries(workstreams)) {
    wsSortOrder++;
    const createdWs = await req<{ id: string }>("POST", `/api/cmp/plans/${planId}/workstreams`, {
      code: wsCode, name: ws.name, weight: ws.weight, sortOrder: wsSortOrder,
    });
    wsCount++;
    console.log(`[${wsCount}/${Object.keys(workstreams).length}] Workstream ${wsCode} — ${ws.name}`);

    let initSortOrder = 0;
    for (const [initCode, init] of Object.entries(ws.initiatives)) {
      initSortOrder++;
      const createdInit = await req<{ id: string }>("POST", `/api/cmp/workstreams/${createdWs.id}/initiatives`, {
        code: initCode, name: init.name, weight: init.weight, sortOrder: initSortOrder,
      });
      initCount++;

      let facSortOrder = 0;
      for (const [facCode, fac] of Object.entries(init.factors)) {
        facSortOrder++;
        const createdFac = await req<{ id: string }>("POST", `/api/cmp/initiatives/${createdInit.id}/factors`, {
          code: facCode, name: fac.name, weight: fac.weight, sortOrder: facSortOrder,
        });
        facCount++;

        for (const item of fac.items) {
          await req("POST", `/api/cmp/factors/${createdFac.id}/items`, {
            itemCode: item.itemCode,
            name: item.name,
            weight: item.weight,
            scoringMethod: item.method,
            criticalGate: item.criticalGate,
            evidenceRequired: item.evidenceRequired,
            ownerRoleTitle: item.owner,
            startDate: item.start ?? undefined,
            targetDate: item.target ?? undefined,
          });
          itemCount++;
        }
      }
    }
  }

  console.log(`\nImport complete: ${wsCount} workstreams, ${initCount} initiatives, ${facCount} factors, ${itemCount} items.`);

  const validation = await req<{ valid: boolean; groups: unknown[] }>("POST", `/api/cmp/plans/${planId}/baseline/validate`, {});
  console.log(`Weight validation: ${validation.valid ? "ALL VALID" : "INVALID"} (${(validation.groups as { valid: boolean }[]).length} groups checked)`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
