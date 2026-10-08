import { report } from "./report";

export class ApiError extends Error {
  constructor(message, { status, details = [] } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    report("api-network", error, `${options.method ?? "GET"} ${url}`);
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status >= 500) report("api-server", new Error(payload.error || "Request failed"), `${options.method ?? "GET"} ${url} ${response.status}`);
    throw new ApiError(payload.error || "Request failed", {
      status: response.status,
      details: Array.isArray(payload.details) ? payload.details : [],
    });
  }
  return payload;
}

export const hanseiApi = {
  list: (recording) => api(recording ? `/api/hansei?recording=${encodeURIComponent(recording)}` : "/api/hansei").then((payload) => payload.hansei),
  create: (recording, at, body) => api("/api/hansei", { method: "POST", body: JSON.stringify({ recording, at, body }) }),
  update: (id, body) => api(`/api/hansei/${id}`, { method: "PUT", body: JSON.stringify({ body }) }),
  remove: (id) => api(`/api/hansei/${id}`, { method: "DELETE" }),
};

export const principlesApi = {
  list: () => api("/api/principles").then((payload) => payload.principles),
  save: (slot, body) => api(`/api/principles/${slot}`, { method: "PUT", body: JSON.stringify({ body }) }),
};
