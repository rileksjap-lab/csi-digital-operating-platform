export async function apiFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }

  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error?.message ?? "Request failed");
  }

  return json.data as T;
}

async function apiMutate<T>(
  method: string,
  url: string,
  body: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error?.message ?? "Request failed");
  }

  return json.data as T;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiMutate<T>("POST", url, body);
}

export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return apiMutate<T>("PATCH", url, body);
}

export async function apiDelete<T>(url: string): Promise<T> {
  return apiMutate<T>("DELETE", url, {});
}
