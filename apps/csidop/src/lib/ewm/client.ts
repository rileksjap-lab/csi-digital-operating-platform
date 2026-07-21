const EWM_BASE_URL = process.env.EWM_BASE_URL ?? "";
const EWM_API_KEY = process.env.EWM_API_KEY ?? "";

export interface EwmWorkOrder {
  id: number;
  wo_number: string;
  header: string;
  task_description?: string;
  expected_result?: string;
  source_of_work_order?: string;
  requester_name?: string;
  requester_email?: string;
  department_id?: number;
  department_code?: string;
  job_type?: string;
  request_type?: string;
  priority_inter?: string;
  priority_internal?: string;
  status: string;
  computed_due_date?: string;
  task_attachments?: string[];
  created_at: string;
  updated_at: string;
}

interface EwmListResponse {
  data: EwmWorkOrder[];
  count: number;
}

export function isEwmConfigured(): boolean {
  return !!EWM_BASE_URL && !!EWM_API_KEY;
}

export async function listWorkOrders(since: Date): Promise<EwmWorkOrder[]> {
  if (!isEwmConfigured()) {
    console.log("[ewm-client] EWM_BASE_URL or EWM_API_KEY not configured, skipping");
    return [];
  }

  const url = `${EWM_BASE_URL}/work-orders?since=${encodeURIComponent(since.toISOString())}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${EWM_API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`[ewm-client] GET /work-orders failed: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as EwmListResponse;
  return body.data ?? [];
}
