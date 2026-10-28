import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();

type Permission =
  | "applications:review"
  | "deployments:assign"
  | "reporting:confirm";

function requirePermission(request: { auth?: { uid: string; token: Record<string, unknown> } }, permission: Permission) {
  const auth = request.auth;
  const permissions = auth?.token.permissions;
  if (!auth || auth.token.accountStatus !== "active" || !Array.isArray(permissions) || !permissions.includes(permission)) {
    throw new HttpsError("permission-denied", "You are not authorized to perform this action.");
  }
  return auth;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new HttpsError("invalid-argument", `Provide a valid ${field}.`);
  }
  return value.trim();
}

export const registerPersonnel = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to complete registration.");
  const fullName = requiredText(request.data.fullName, "full name", 120);
  const telephone = requiredText(request.data.telephone, "telephone number", 32);
  const nssNumber = requiredText(request.data.nssNumber, "NSS number", 15).toUpperCase();
  const nationalId = requiredText(request.data.nationalId, "national identity card number", 15);
  if (!/^[A-Z]{3}\d{12}$/.test(nssNumber)) {
    throw new HttpsError("invalid-argument", "Enter 3 uppercase letters followed by 12 numbers for the NSS number.");
  }
  if (!/^GHA-\d{9}-\d$/.test(nationalId)) {
    throw new HttpsError("invalid-argument", "Enter your Ghana Card number in the format GHA-265893864-5.");
  }
  if (!/^(?:\+233|0)\d{9}$/.test(telephone.replace(/[\s()-]/g, ""))) {
    throw new HttpsError("invalid-argument", "Enter a valid Ghanaian telephone number.");
  }
  const userRef = db.collection("users").doc(request.auth.uid);
  const nssRef = db.collection("nssRegistry").doc(nssNumber);
  await getAuth().setCustomUserClaims(request.auth.uid, {
    role: "personnel",
    permissions: [],
    accountStatus: "active",
  });
  await db.runTransaction(async (transaction) => {
    const [user, existingNss] = await Promise.all([transaction.get(userRef), transaction.get(nssRef)]);
    if (user.exists) throw new HttpsError("already-exists", "This account is already registered.");
    if (existingNss.exists) throw new HttpsError("already-exists", "This NSS number is already registered.");
    transaction.create(nssRef, { uid: request.auth!.uid, createdAt: FieldValue.serverTimestamp() });
    transaction.create(userRef, {
      uid: request.auth!.uid,
      fullName,
      email: request.auth!.token.email ?? "",
      telephone,
      role: "personnel",
      accountStatus: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(db.collection("personnel").doc(request.auth!.uid), {
      userId: request.auth!.uid,
      nssNumber,
      nationalId,
      fullName,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { success: true };
});

export const submitApplication = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to submit an application.");
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Verify your email before submitting an application.");
  }
  const uid = request.auth.uid;
  const fullName = requiredText(request.data.fullName, "full name", 120);
  const programme = requiredText(request.data.programme, "programme", 160);
  const intakeId = requiredText(request.data.intakeId, "intake", 80);
  const phone = requiredText(request.data.telephone, "telephone number", 32);
  const applicationRef = db.collection("applications").doc();
  const counterRef = db.collection("system").doc("referenceCounter");
  const auditRef = db.collection("auditLogs").doc();
  const reference = await db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(uid);
    const user = await transaction.get(userRef);
    if (!user.exists || user.data()?.accountStatus !== "active") {
      throw new HttpsError("permission-denied", "Your account is not active.");
    }
    const existing = await db.collection("applications")
      .where("personnelUid", "==", uid).where("applicationStatus", "in", ["DRAFT", "SUBMITTED", "RESUBMITTED"]).limit(1).get();
    if (!existing.empty) throw new HttpsError("already-exists", "An active application already exists.");
    const counter = await transaction.get(counterRef);
    const sequence = Number(counter.data()?.next ?? 1);
    const ref = `HTU-NS-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
    transaction.set(counterRef, { next: sequence + 1 }, { merge: true });
    transaction.create(applicationRef, {
      personnelUid: uid,
      reference: ref,
      fullName,
      programme,
      intakeId,
      telephone: phone,
      applicationStatus: "SUBMITTED",
      verificationStatus: "PENDING",
      createdAt: FieldValue.serverTimestamp(),
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      actorUid: uid,
      actorRole: "personnel",
      action: "application.submitted",
      targetId: applicationRef.id,
      timestamp: FieldValue.serverTimestamp(),
    });
    return ref;
  });
  return { applicationId: applicationRef.id, reference };
});

export const decideApplication = onCall(async (request) => {
  const auth = requirePermission(request, "applications:review");
  const applicationId = requiredText(request.data.applicationId, "application ID", 120);
  const decision = request.data.decision;
  if (decision !== "APPROVED" && decision !== "REJECTED" && decision !== "CORRECTION_REQUIRED") {
    throw new HttpsError("invalid-argument", "Choose a valid application decision.");
  }
  const reason = requiredText(request.data.reason, "decision reason", 2000);
  const ref = db.collection("applications").doc(applicationId);
  const auditRef = db.collection("auditLogs").doc();
  await db.runTransaction(async (transaction) => {
    const application = await transaction.get(ref);
    if (!application.exists || !["SUBMITTED", "RESUBMITTED"].includes(String(application.data()?.applicationStatus))) {
      throw new HttpsError("failed-precondition", "This application is not ready for review.");
    }
    const next = decision as "APPROVED" | "REJECTED" | "CORRECTION_REQUIRED";
    if (next === "APPROVED" && application.data()?.verificationStatus !== "VERIFIED") {
      throw new HttpsError("failed-precondition", "Verify all required checks before approval.");
    }
    transaction.update(ref, {
      applicationStatus: next,
      decisionReason: reason,
      decidedBy: auth.uid,
      decidedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      actorUid: auth.uid,
      actorRole: "hr",
      action: `application.${next.toLowerCase()}`,
      targetId: applicationId,
      reason,
      timestamp: FieldValue.serverTimestamp(),
    });
  });
  return { success: true };
});

export const deployPersonnel = onCall(async (request) => {
  const auth = requirePermission(request, "deployments:assign");
  const applicationId = requiredText(request.data.applicationId, "application ID", 120);
  const unitId = requiredText(request.data.unitId, "unit", 120);
  const reportingLocation = requiredText(request.data.reportingLocation, "reporting location", 240);
  const reportingDate = requiredText(request.data.reportingDate, "reporting date", 40);
  const applicationRef = db.collection("applications").doc(applicationId);
  const deploymentRef = db.collection("deployments").doc();
  const unitRef = db.collection("units").doc(unitId);
  const auditRef = db.collection("auditLogs").doc();
  await db.runTransaction(async (transaction) => {
    const application = await transaction.get(applicationRef);
    if (!application.exists) throw new HttpsError("failed-precondition", "Only approved personnel can be deployed.");
    const personnelUid = String(application.data()?.personnelUid ?? "");
    const ownerRef = db.collection("personnel").doc(personnelUid);
    const [unit, personnel] = await Promise.all([transaction.get(unitRef), transaction.get(ownerRef)]);
    if (!application.exists || application.data()?.applicationStatus !== "APPROVED") {
      throw new HttpsError("failed-precondition", "Only approved personnel can be deployed.");
    }
    if (!unit.exists || unit.data()?.active !== true) {
      throw new HttpsError("failed-precondition", "Select an active configured unit.");
    }
    if (personnel.data()?.activeDeploymentId) {
      throw new HttpsError("already-exists", "This person already has an active deployment.");
    }
    const deployment = {
      applicationId,
      personnelUid,
      unitId,
      departmentId: unit.data()?.departmentId,
      supervisorUid: unit.data()?.supervisorUid ?? null,
      reportingLocation,
      reportingDate,
      status: "ACTIVE",
      assignedBy: auth.uid,
      assignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(deploymentRef, deployment);
    transaction.update(ownerRef, { activeDeploymentId: deploymentRef.id, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(auditRef, {
      actorUid: auth.uid,
      actorRole: "hr",
      action: "deployment.assigned",
      targetId: deploymentRef.id,
      timestamp: FieldValue.serverTimestamp(),
    });
  });
  return { success: true };
});

export const confirmReporting = onCall(async (request) => {
  const auth = requirePermission(request, "reporting:confirm");
  const deploymentId = requiredText(request.data.deploymentId, "deployment", 120);
  const reportDate = requiredText(request.data.reportDate, "report date", 40);
  const ref = db.collection("deployments").doc(deploymentId);
  const auditRef = db.collection("auditLogs").doc();
  await db.runTransaction(async (transaction) => {
    const deployment = await transaction.get(ref);
    if (!deployment.exists || deployment.data()?.status !== "ACTIVE") {
      throw new HttpsError("failed-precondition", "This deployment is not active.");
    }
    const unitId = deployment.data()?.unitId;
    const authorizedUnits = auth.token.unitIds;
    if (!Array.isArray(authorizedUnits) || !authorizedUnits.includes(unitId)) {
      throw new HttpsError("permission-denied", "You are not assigned to this unit.");
    }
    transaction.update(ref, {
      status: "REPORTED",
      reportedAt: FieldValue.serverTimestamp(),
      reportDate,
      confirmedBy: auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      actorUid: auth.uid,
      actorRole: "supervisor",
      action: "reporting.confirmed",
      targetId: deploymentId,
      timestamp: FieldValue.serverTimestamp(),
    });
  });
  return { success: true };
});
