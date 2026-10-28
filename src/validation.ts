import { z } from "zod";

export const signupSchema = z.object({
  fullName: z.string().trim().min(3, "Enter your full legal name."),
  nssNumber: z.string().trim().regex(/^[A-Z]{3}\d{12}$/, "Enter 3 uppercase letters followed by 12 numbers (for example, GHU376609813426)."),
  nationalId: z.string().trim().regex(/^GHA-\d{9}-\d$/, "Enter your Ghana Card number in the format GHA-265893864-5."),
  telephone: z.string().trim().regex(/^(?:\+233|0)[\d\s()-]{9,14}$/, "Enter a valid Ghanaian telephone number."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters, including a number and a symbol.")
    .regex(/[0-9]/, "Include at least one number.").regex(/[^A-Za-z0-9]/, "Include at least one symbol."),
  confirmation: z.string(),
}).refine((value) => value.password === value.confirmation, {
  path: ["confirmation"], message: "Passwords do not match.",
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
