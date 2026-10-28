export type PortalUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  role: "personnel" | "hr" | "supervisor" | "administrator";
  permissions: string[];
  unitIds: string[];
};

export type PortalApplication = {
  id: string;
  reference: string;
  fullName: string;
  qualification?: string | null;
  programme: string;
  intakeId: string;
  telephone: string;
  applicationStatus: string;
  verificationStatus: string;
  decisionReason?: string | null;
  submittedAt: string;
  personnelEmail?: string;
  personnelEmailVerified?: boolean;
  nssNumber?: string | null;
  nationalId?: string | null;
  deploymentStatus?: string | null;
  reportedAt?: string | null;
  solicitorName?: string | null;
  solicitorContact?: string | null;
  requestedUnitId?: string | null;
  positionInterest?: string | null;
  requestedUnitName?: string | null;
};

export type PortalUnit = {
  id: string;
  name: string;
  unitType: string;
  departmentId: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  active?: boolean;
};

export type PortalSupervisor = {
  id: string;
  name: string;
  email: string;
};

export type PortalAdminUser = {
  uid: string;
  email: string;
  displayName: string;
  role: PortalUser["role"];
  permissions: string[];
  unitIds: string[];
  accountStatus: "active" | "suspended";
  emailVerified: boolean;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: string; code?: string } & T;
  if (!response.ok) {
    throw new ApiError(body.error ?? "The request could not be completed.", body.code ?? "request-failed", response.status);
  }
  return body;
}
