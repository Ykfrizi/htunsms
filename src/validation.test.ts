import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema } from "./validation";

const validRegistration = {
  fullName: "Ama Mensah",
  nssNumber: "GHU376609813426",
  nationalId: "GHA-265893864-5",
  telephone: "+233 24 123 4567",
  email: "ama@example.com",
  password: "Service#2026",
  confirmation: "Service#2026",
};

describe("account validation", () => {
  it("accepts a valid registration with a Ghanaian phone number", () => {
    expect(signupSchema.safeParse(validRegistration).success).toBe(true);
  });

  it("rejects mismatched passwords and invalid phone numbers", () => {
    expect(signupSchema.safeParse({ ...validRegistration, confirmation: "Different#2026" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validRegistration, telephone: "555-0100" }).success).toBe(false);
  });

  it("requires the NSS and Ghana Card number formats", () => {
    expect(signupSchema.safeParse({ ...validRegistration, nssNumber: "GHU376609813426" }).success).toBe(true);
    expect(signupSchema.safeParse({ ...validRegistration, nssNumber: "ghu376609813426" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validRegistration, nssNumber: "GHU37660981342" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validRegistration, nationalId: "GHA-265893864-5" }).success).toBe(true);
    expect(signupSchema.safeParse({ ...validRegistration, nationalId: "GHA2658938645" }).success).toBe(false);
  });

  it("requires a valid email and a non-empty password at sign in", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "secret" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "ama@example.com", password: "secret" }).success).toBe(true);
  });
});
