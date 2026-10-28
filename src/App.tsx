import { Fragment, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity, ArrowRight, Bell, BookOpenCheck, BriefcaseBusiness,
  CalendarDays, Check, CheckCheck, ChevronDown, CircleHelp, ClipboardCheck,
  FileCheck2, FileClock, FileText, LayoutDashboard, LockKeyhole, LogOut,
  Menu, Search, ShieldCheck, Users, X,
} from "lucide-react";
import { z } from "zod";
import { ApiError, apiRequest } from "./api";
import type { PortalAdminUser, PortalApplication, PortalSupervisor, PortalUnit, PortalUser } from "./api";
import { loginSchema, signupSchema } from "./validation";

type Role = "personnel" | "hr" | "supervisor" | "administrator";
type PortalView = "Overview" | "My application" | "Verification queue" | "Approved personnel" | "Deployment management" | "Unit management" | "Reporting" | "User management" | "Notifications";
type Application = PortalApplication;

const navByRole: Record<Role, PortalView[]> = {
  personnel: ["Overview", "My application", "Notifications"],
  hr: ["Overview", "Verification queue", "Approved personnel", "Deployment management", "Notifications"],
  supervisor: ["Overview", "Reporting", "Notifications"],
  administrator: ["Overview", "Verification queue", "User management", "Notifications"],
};

const programmeOptions = [
  "Hospitality Management", "Food Technology", "Food Science", "ICT", "Computer Science",
  "Statistics", "Agro Enterprise Development", "Electrical Engineering", "Civil Engineering",
  "Mechanical Engineering", "Building Technology", "Fashion Design and Industrial Art",
  "Accountancy", "Procurement and Supply", "Marketing", "Banking and Finance",
  "Secretaryship and Management Studies",
];

function getRole(user: PortalUser | null): Role {
  return user?.role ?? "personnel";
}

function App() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [portalView, setPortalView] = useState<PortalView>("Overview");
  const [authMode, setAuthMode] = useState<"login" | "register" | "reset" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const role = getRole(user);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ user: PortalUser | null }>("/auth/me")
      .then(({ user: currentUser }) => {
        if (cancelled) return;
        setUser(currentUser);
        setBackendAvailable(true);
      })
      .catch(() => {
        if (cancelled) return;
        setBackendAvailable(false);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const refreshUser = async () => {
    const response = await apiRequest<{ user: PortalUser | null }>("/auth/me");
    setUser(response.user);
    setBackendAvailable(true);
  };

  const goToPortal = (view: PortalView) => {
    setPortalView(view);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!authReady) return <div className="startup"><span className="loader" />Connecting to HTU Portal…</div>;

  return (
    <>
      {!user ? (
        <Landing onAuth={setAuthMode} configured={backendAvailable} />
      ) : (
        <Portal
          user={user}
          role={role}
          view={portalView}
          setView={goToPortal}
          mobileNav={mobileNav}
          setMobileNav={setMobileNav}
          onToast={setToast}
          onSignedOut={() => setUser(null)}
        />
      )}
      {authMode && <AuthDialog mode={authMode} onClose={() => setAuthMode(null)} onModeChange={setAuthMode} onToast={setToast} onAuthenticated={refreshUser} />}
      {toast && <div role="status" className="toast"><Check size={17} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={16} /></button></div>}
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? "brand-compact" : ""}`} href="#" aria-label="HTU National Service home">
      <img className="brand-logo" src="/htu-logo.png" alt="Ho Technical University emblem" />
      {!compact && <span className="brand-text"><strong>HTU</strong><small>National Service Portal</small></span>}
    </a>
  );
}

function Landing({ onAuth, configured }: { onAuth: (mode: "login" | "register") => void; configured: boolean }) {
  return (
    <main className="landing">
      <div className="topline">
        <div className="container header-inner">
          <Brand />
          <nav className="landing-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#support">Help &amp; support</a>
            <button className="button button-quiet" onClick={() => onAuth("login")}>Sign in</button>
            <button className="button button-primary" onClick={() => onAuth("register")}>Start application <ArrowRight size={16} /></button>
          </nav>
        </div>
      </div>
      {!configured && <div className="config-banner"><LockKeyhole size={17} /> The local HTU API is unavailable. Start XAMPP MySQL and run <code>npm run dev:all</code>.</div>}
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow"><span className="status-dot" /> Ho Technical University · Ho, Ghana</span>
          <h1>Your National Service <span>at HTU</span></h1>
          <p className="hero-lede">Apply for National Service, track your application, receive HR decisions, and access authorized deployment and reporting details through one secure university portal.</p>
          <div className="hero-actions">
            <button className="button button-primary button-large" onClick={() => onAuth("register")}>Begin your application <ArrowRight size={17} /></button>
            <button className="button button-outline button-large" onClick={() => onAuth("login")}>Sign in to your account</button>
          </div>
          <div className="trust-note"><ShieldCheck size={17} /> Your information is handled through a secure, role-based portal.</div>
        </div>
        <div className="hero-visual">
          <div className="hero-emblem-card"><div className="emblem-halo" /><img src="/htu-logo.png" alt="" /><div className="emblem-caption">LEARN · SERVE · GROW</div></div>
          <div className="float-card float-card-top"><span className="float-icon navy"><FileCheck2 size={18} /></span><span><strong>Application tracking</strong><small>Know where you stand</small></span><span className="float-check"><Check size={14} /></span></div>
          <div className="float-card float-card-bottom"><span className="float-icon red"><ShieldCheck size={18} /></span><span><strong>Official decisions</strong><small>Made by authorized HTU staff</small></span></div>
        </div>
        <div className="hero-watermark">HTU</div>
      </section>
      <section className="process-section" id="how-it-works">
        <div className="container">
          <div className="section-heading"><span className="eyebrow">A clear path forward</span><h2>Four steps. One secure portal.</h2><p>From your first application to your first day reporting, stay informed at every stage.</p></div>
          <div className="steps">
            <ProcessStep number="01" icon={<FileText />} title="Apply" text="Create your account and submit your National Service details securely." />
            <ProcessStep number="02" icon={<ClipboardCheck />} title="Verify" text="HTU HR reviews your application and supporting documents." />
            <ProcessStep number="03" icon={<BriefcaseBusiness />} title="Deploy" text="Approved personnel are assigned to a configured HTU unit." />
            <ProcessStep number="04" icon={<CheckCheck />} title="Report" text="Report to your assigned supervisor and begin your service." />
          </div>
        </div>
      </section>
      <footer className="landing-footer" id="support"><div className="container footer-inner"><Brand /><div><span>Ho Technical University</span><span>Ho, Volta Region, Ghana</span></div><div className="footer-links"><a href="mailto:">Help &amp; support</a><a href="#privacy">Privacy information</a></div><small>© {new Date().getFullYear()} HTU National Service Portal</small></div></footer>
    </main>
  );
}

function ProcessStep({ number, icon, title, text }: { number: string; icon: ReactNode; title: string; text: string }) {
  return <article className="step-card"><span className="step-number">{number}</span><span className="step-icon">{icon}</span><h3>{title}</h3><p>{text}</p></article>;
}

function AuthDialog({ mode, onClose, onModeChange, onToast, onAuthenticated }: {
  mode: "login" | "register" | "reset";
  onClose: () => void;
  onModeChange: (mode: "login" | "register" | "reset") => void;
  onToast: (message: string) => void;
  onAuthenticated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState({ fullName: "", nssNumber: "", nationalId: "", telephone: "", email: "", password: "", confirmation: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const updateField = (name: keyof typeof fields, value: string) => {
    setFields((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setActionUrl("");
    setBusy(true);
    try {
      if (mode === "register") {
        const parsed = signupSchema.safeParse(fields);
        if (!parsed.success) {
          const errors: Record<string, string> = {};
          parsed.error.issues.forEach((issue) => { errors[String(issue.path[0])] = issue.message; });
          setFieldErrors(errors);
          setBusy(false);
          return;
        }
        const result = await apiRequest<{ verificationUrl?: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify(parsed.data),
        });
        await onAuthenticated();
        setActionUrl(result.verificationUrl ?? "");
        setMessage("Your account is created. Verify your email before submitting an application. Registration does not submit an application or grant approval.");
      } else if (mode === "reset") {
        const parsed = z.string().email("Enter your account email address.").safeParse(fields.email);
        if (!parsed.success) {
          setFieldErrors({ email: parsed.error.issues[0]?.message ?? "Enter a valid email." });
          setBusy(false);
          return;
        }
        const result = await apiRequest<{ resetUrl?: string }>("/auth/password-reset", {
          method: "POST",
          body: JSON.stringify({ email: parsed.data }),
        });
        setActionUrl(result.resetUrl ?? "");
        setMessage("If an account exists for that email, a password reset link has been sent.");
      } else {
        const parsed = loginSchema.safeParse(fields);
        if (!parsed.success) {
          const errors: Record<string, string> = {};
          parsed.error.issues.forEach((issue) => { errors[String(issue.path[0])] = issue.message; });
          setFieldErrors(errors);
          setBusy(false);
          return;
        }
        await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify(parsed.data),
        });
        await onAuthenticated();
        onClose();
        onToast("Signed in securely.");
      }
    } catch (caught) {
      setError(authMessage(caught instanceof ApiError ? caught.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "register" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back";
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
        <div className="auth-heading"><Brand compact /><span className="eyebrow">HTU · NATIONAL SERVICE</span><h2 id="auth-title">{title}</h2><p>{mode === "register" ? "Start with a secure account. Account creation does not submit an application or grant approval." : mode === "reset" ? "We’ll send a secure reset link if an account matches your email." : "Sign in to continue to your secure personnel portal."}</p></div>
        <form onSubmit={submit} noValidate>
          {mode === "register" && <>
            <FormInput label="Full legal name" value={fields.fullName} onChange={(value) => updateField("fullName", value)} error={fieldErrors.fullName} placeholder="Enter your name" autoComplete="name" />
            <FormInput label="NSS number" value={fields.nssNumber} onChange={(value) => updateField("nssNumber", value)} error={fieldErrors.nssNumber} placeholder="GHU376609813426" />
            <FormInput label="National identity card number" value={fields.nationalId} onChange={(value) => updateField("nationalId", value.toUpperCase())} error={fieldErrors.nationalId} placeholder="GHA-265893864-5" />
            <FormInput label="Telephone" value={fields.telephone} onChange={(value) => updateField("telephone", value)} error={fieldErrors.telephone} placeholder="+233 24 000 0000" autoComplete="tel" />
          </>}
          <FormInput label="Email address" type="email" value={fields.email} onChange={(value) => updateField("email", value)} error={fieldErrors.email} placeholder="you@example.com" autoComplete="email" />
          {mode !== "reset" && <>
            <FormInput label="Password" type={showPassword ? "text" : "password"} value={fields.password} onChange={(value) => updateField("password", value)} error={fieldErrors.password} placeholder={mode === "register" ? "At least 10 characters" : "Enter your password"} autoComplete={mode === "register" ? "new-password" : "current-password"} trailing={<button className="field-link" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>} />
            {mode === "register" && <FormInput label="Confirm password" type="password" value={fields.confirmation} onChange={(value) => updateField("confirmation", value)} error={fieldErrors.confirmation} placeholder="Re-enter your password" autoComplete="new-password" />}
          </>}
          {error && <div className="form-alert error-alert" role="alert">{error}</div>}
          {message && <div className="form-alert success-alert" role="status">{message}</div>}
          {actionUrl && <a className="text-button" href={actionUrl} target="_blank" rel="noreferrer">{mode === "register" ? "Open email verification link" : "Open password reset link"} <ArrowRight size={14} /></a>}
          <button className="button button-primary button-full" type="submit" disabled={busy}>{busy && <span className="loader small-loader" />}{busy ? "Please wait…" : mode === "register" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}<ArrowRight size={16} /></button>
        </form>
        <div className="auth-switch">
          {mode === "login" ? <><button onClick={() => onModeChange("reset")}>Forgot password?</button><span>New to HTU? <button onClick={() => onModeChange("register")}>Create an account</button></span></> : <span>Already have an account? <button onClick={() => onModeChange("login")}>Sign in</button></span>}
        </div>
        <p className="auth-safety"><LockKeyhole size={13} /> Protected by the local HTU authentication service</p>
      </section>
    </div>
  );
}

function FormInput({ label, value, onChange, error, placeholder, type = "text", autoComplete, trailing, list }: {
  label: string; value: string; onChange: (value: string) => void; error?: string; placeholder?: string; type?: string; autoComplete?: string; trailing?: ReactNode; list?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <label className={`form-field ${error ? "field-error" : ""}`} htmlFor={id}><span>{label}</span><div className="input-wrap"><input id={id} name={id} type={type} list={list} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />{trailing}</div>{error && <small id={`${id}-error`} className="field-error-text">{error}</small>}</label>;
}

function authMessage(code?: string) {
  const messages: Record<string, string> = {
    "already-exists": "An account already exists for these details. Sign in or check the NSS and Ghana Card numbers.",
    "invalid-credential": "The email or password is incorrect.",
    "invalid-argument": "Check the information entered and try again.",
    "too-many-requests": "Too many attempts. Wait a little while, then try again.",
    "email-not-configured": "Email delivery is not configured. Contact the system administrator.",
  };
  return messages[code ?? ""] ?? "We could not complete that request. Please try again.";
}

function Portal({ user, role, view, setView, mobileNav, setMobileNav, onToast, onSignedOut }: {
  user: PortalUser; role: Role; view: PortalView; setView: (view: PortalView) => void; mobileNav: boolean;
  setMobileNav: (value: boolean) => void; onToast: (message: string) => void; onSignedOut: () => void;
}) {
  const navItems: PortalView[] = role === "administrator"
    ? [
      "Overview",
      ...(user.permissions.includes("applications:read") ? ["Verification queue" as const] : []),
      ...(user.permissions.includes("deployments:assign") ? ["Deployment management" as const, "Unit management" as const] : []),
      ...(user.permissions.includes("users:read") ? ["User management" as const] : []),
      "Notifications",
    ]
    : navByRole[role];
  const roleLabel = { personnel: "National Service Personnel", hr: "HR Officer", supervisor: "Department Supervisor", administrator: "System Administrator" }[role];
  const [search, setSearch] = useState("");
  const [application, setApplication] = useState<Application | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [units, setUnits] = useState<PortalUnit[]>([]);
  const [unitLoadError, setUnitLoadError] = useState("");
  const [applicationLoading, setApplicationLoading] = useState(true);
  const [applicationError, setApplicationError] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState({
    fullName: user.displayName ?? "",
    qualification: "",
    programme: "",
    intakeId: "",
    telephone: "",
    solicitorName: "",
    solicitorContact: "",
    requestedUnitId: "",
    positionInterest: "",
  });
  const firstName = user.displayName?.split(" ")[0] || "there";

  useEffect(() => {
    let cancelled = false;
    async function loadApplications() {
      setApplicationLoading(true);
      setApplicationError("");
      try {
        const { applications } = await apiRequest<{ applications: Application[] }>("/applications");
        if (cancelled) return;
        setApplications(applications);
        setApplication(applications[0] ?? null);
      } catch (caught) {
        if (cancelled) return;
        setApplicationError(caught instanceof Error ? caught.message : "Unable to load application information.");
      } finally {
        if (!cancelled) setApplicationLoading(false);
      }
    }
    void loadApplications();
    return () => { cancelled = true; };
  }, [role, user.uid]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ units: PortalUnit[] }>("/units")
      .then(({ units: availableUnits }) => {
        if (!cancelled) setUnits(availableUnits);
      })
      .catch((caught) => {
        if (!cancelled) setUnitLoadError(caught instanceof Error ? caught.message : "Could not load HTU units.");
      });
    return () => { cancelled = true; };
  }, [user.uid]);

  const stats = useMemo(() => {
    const status = application?.applicationStatus;
    return [
      { label: "Applications received", value: application ? "1" : "0", icon: <Users />, tone: "blue" },
      { label: "Awaiting verification", value: status === "SUBMITTED" || status === "RESUBMITTED" ? "1" : "0", icon: <FileClock />, tone: "amber" },
      { label: "Approved", value: status === "APPROVED" ? "1" : "0", icon: <CheckCheck />, tone: "green" },
      { label: "Deployed", value: "—", icon: <BriefcaseBusiness />, tone: "purple" },
    ];
  }, [application]);

  const submitApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (!user.emailVerified) { onToast("Verify your email before submitting an application."); return; }
    if (draft.fullName.trim().length < 3 || !draft.qualification || draft.programme.trim().length < 2 || draft.intakeId.trim().length < 2 || !draft.telephone.trim()) {
      onToast("Complete each required field before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/applications", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      onToast("Application submitted. Your reference and status will appear here.");
      setShowApplicationForm(false);
      window.location.reload();
    } catch (caught) {
      onToast(caught instanceof ApiError && caught.code === "already-exists" ? "An active application already exists." : "Application could not be submitted. Check the required details and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const signOutUser = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      onSignedOut();
      onToast("You have signed out.");
    } catch {
      onToast("Could not sign out. Check the local API connection.");
    }
  };

  const resendVerification = async () => {
    try {
      const result = await apiRequest<{ verificationUrl?: string; alreadyVerified?: boolean }>("/auth/verification/resend", { method: "POST" });
      setVerificationUrl(result.verificationUrl ?? "");
      onToast(result.alreadyVerified ? "Your email is already verified." : "A local verification link has been created.");
    } catch {
      onToast("Could not create a verification link. Check the local API.");
    }
  };

  return (
    <div className="portal-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand"><Brand /><button aria-label="Close menu" className="sidebar-close" onClick={() => setMobileNav(false)}><X size={19} /></button></div>
        <div className="portal-label">YOUR PORTAL</div>
        <nav className="side-navigation" aria-label="Portal navigation">
          {navItems.map((item) => <button key={item} className={`side-link ${view === item ? "side-link-active" : ""}`} onClick={() => setView(item)}>{navIcon(item)}<span>{item}</span>{item === "Verification queue" && application?.applicationStatus === "SUBMITTED" && <i className="nav-count">1</i>}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-help"><span className="help-icon"><CircleHelp size={18} /></span><strong>Need some help?</strong><span>We’re here to guide you.</span><button onClick={() => onToast("Support contact details will be published by HTU.")}>Get support <ArrowRight size={13} /></button></div><button className="side-link logout-link" onClick={signOutUser}><LogOut size={18} /><span>Log out</span></button><div className="sidebar-version">HTU-NSPMS <span>v0.1</span></div></div>
      </aside>
      {mobileNav && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}
      <main className="portal-main">
        <header className="portal-header">
          <button className="mobile-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="breadcrumbs">HTU Portal <span>/</span> {view}</div>
          <div className="header-actions">
            <label className="search-box"><Search size={16} /><input aria-label="Search portal" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" /><kbd>⌘ K</kbd></label>
            <button className="notification-button" aria-label="Notifications" onClick={() => setView("Notifications")}><Bell size={19} /><i /></button>
            <div className="header-divider" />
            <button className="profile-chip" onClick={() => onToast(`${user.email ?? ""} · ${roleLabel}`)}><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span className="profile-name">{firstName}<small>{roleLabel}</small></span><ChevronDown size={15} /></button>
          </div>
        </header>
        <div className="portal-content">
          <div className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div><h1>{view === "Overview" ? `Good day, ${firstName}` : view}</h1><p>{view === "Overview" ? role === "personnel" ? "Here’s where things stand with your National Service journey." : "Here is the latest information available to your account." : viewDescription(view, role)}</p></div><div className="welcome-actions"><span className="role-tag"><ShieldCheck size={14} /> {roleLabel}</span>{role === "personnel" && !application && <button className="button button-primary" onClick={() => setShowApplicationForm(true)}>Start application <ArrowRight size={15} /></button>}</div></div>

          {view === "Overview" && <>
            {!user.emailVerified && <div className="notice notice-amber"><span className="notice-icon"><LockKeyhole size={18} /></span><div><strong>Verify your email to continue</strong><p>Open the local verification link to verify {user.email} before submitting an application.</p>{verificationUrl && <a href={verificationUrl} target="_blank" rel="noreferrer">Open verification link</a>}</div><button className="notice-action" onClick={resendVerification}>Create verification link</button></div>}
            {applicationError && <div className="notice notice-error" role="alert"><strong>Could not load live application data</strong><p>{applicationError}</p></div>}
            <div className="stats-grid">{stats.map((item) => <article className="stat-card" key={item.label}><div className={`stat-icon ${item.tone}`}>{item.icon}</div><div className="stat-number">{applicationLoading ? "…" : item.value}</div><div className="stat-label">{item.label}</div><div className="stat-foot">{role === "personnel" ? "Your account" : "Live portal data"}</div></article>)}</div>
            <div className="dashboard-grid">
              <section className="panel application-panel">
                <div className="panel-heading"><div><h2>{role === "personnel" ? "My application" : "Application overview"}</h2><p>Your application status and latest update</p></div><button className="text-button" onClick={() => setView(role === "personnel" ? "My application" : "Verification queue")}>View details <ArrowRight size={14} /></button></div>
                {applicationLoading ? <LoadingLine /> : application ? <ApplicationSummary application={application} /> : <EmptyApplication onStart={() => setShowApplicationForm(true)} role={role} />}
              </section>
              <section className="panel journey-panel">
                <div className="panel-heading"><div><h2>Service journey</h2><p>Each step updates when confirmed by HTU</p></div><Activity size={19} className="panel-activity" /></div>
                <Journey application={application} />
              </section>
            </div>
            {role === "administrator" && <section className="panel quick-panel"><div className="panel-heading"><div><h2>Administration</h2><p>Manage portal account access and staff permissions</p></div></div><div className="quick-links"><button onClick={() => setView("User management")}><span className="quick-icon blue"><Users /></span><span><strong>User management</strong><small>Assign roles, permissions, and unit access</small></span><ArrowRight size={16} /></button></div></section>}
            {role !== "administrator" && <section className="panel quick-panel"><div className="panel-heading"><div><h2>Quick links</h2><p>Common things you may need</p></div></div><div className="quick-links"><button onClick={() => setView(role === "personnel" ? "My application" : "Verification queue")}><span className="quick-icon blue"><FileText /></span><span><strong>{role === "personnel" ? "My application" : "Review applications"}</strong><small>View details and current status</small></span><ArrowRight size={16} /></button><button onClick={() => setView(role === "personnel" ? "Notifications" : "Deployment management")}><span className="quick-icon red"><CalendarDays /></span><span><strong>{role === "personnel" ? "Notifications" : "Manage deployments"}</strong><small>Updates and next steps</small></span><ArrowRight size={16} /></button><button onClick={() => onToast("Help information will be configured by HTU.")}><span className="quick-icon slate"><CircleHelp /></span><span><strong>Help &amp; support</strong><small>Get help using the portal</small></span><ArrowRight size={16} /></button></div></section>}
          </>}

          {view === "My application" && <section className="panel page-panel"><div className="panel-heading"><div><h2>Application details</h2><p>Official application information from the portal</p></div>{application?.reference && <span className="ref-chip">{application.reference}</span>}</div>{applicationLoading ? <LoadingLine /> : application ? <ApplicationSummary application={application} detailed /> : <EmptyApplication onStart={() => setShowApplicationForm(true)} role={role} />}</section>}
          {view === "Verification queue" && <ApplicationsTable applications={applications} loading={applicationLoading} error={applicationError} search={search} canReview={user.permissions.includes("applications:review")} onReviewed={async () => {
            const result = await apiRequest<{ applications: Application[] }>("/applications");
            setApplications(result.applications);
            setApplication(result.applications[0] ?? null);
            onToast("Application review saved.");
          }} />}
          {view === "User management" && role === "administrator" && <AdminUserManagement currentUserId={user.uid} />}
          {view === "Approved personnel" && <section className="panel page-panel"><EmptyState icon={<Users />} title="Approved personnel" text="Personnel appear here after an authorized HR officer approves their application. Data is shown only when available to your account." /></section>}
          {view === "Deployment management" && <DeploymentManagement applications={applications} units={units} loading={applicationLoading} error={applicationError || unitLoadError} onAssigned={async () => {
            const result = await apiRequest<{ applications: Application[] }>("/applications");
            setApplications(result.applications);
            setApplication(result.applications[0] ?? null);
            onToast("Personnel deployment assigned.");
          }} />}
          {view === "Unit management" && role === "administrator" && <UnitManagement />}
          {view === "Reporting" && <section className="panel page-panel"><EmptyState icon={<ClipboardCheck />} title="Reporting confirmation" text="Only personnel assigned to your authorized unit will appear here. Reporting confirmations require an active supervisor permission." /></section>}
          {view === "Notifications" && <section className="panel page-panel"><EmptyState icon={<Bell />} title="You’re all caught up" text="Portal notifications will appear here when HTU sends an update about your application or service." /></section>}
          <footer className="portal-footer"><span>© {new Date().getFullYear()} Ho Technical University</span><span>National Service Personnel Management System <i /> Secure portal</span></footer>
        </div>
      </main>
      {showApplicationForm && <div className="modal-backdrop" role="presentation"><section className="auth-modal application-modal" role="dialog" aria-modal="true" aria-labelledby="application-form-title"><button className="modal-close" aria-label="Close" onClick={() => setShowApplicationForm(false)}><X size={20} /></button><span className="eyebrow">NATIONAL SERVICE APPLICATION</span><h2 id="application-form-title">Application details</h2><p>Your reference is generated only after the secure submission succeeds.</p><form onSubmit={submitApplication} noValidate>
        <FormInput label="Full legal name" value={draft.fullName} onChange={(fullName) => setDraft((current) => ({ ...current, fullName }))} placeholder="Enter your full name" />
        <label className="form-field"><span>Qualification</span><select required value={draft.qualification} onChange={(event) => setDraft((current) => ({ ...current, qualification: event.target.value }))}><option value="">Select qualification</option><option value="BTech">Bachelor of Technology (BTech)</option><option value="BSc">Bachelor of Science (BSc)</option><option value="HND">Higher National Diploma (HND)</option><option value="2-Year Diploma">2-Year Diploma</option><option value="Other">Other</option></select></label>
        <FormInput label="Programme of study" value={draft.programme} onChange={(programme) => setDraft((current) => ({ ...current, programme }))} placeholder="Your programme or qualification" list="htu-programmes" />
        <datalist id="htu-programmes">{programmeOptions.map((programme) => <option key={programme} value={programme} />)}</datalist>
        <FormInput label="Configured intake ID" value={draft.intakeId} onChange={(intakeId) => setDraft((current) => ({ ...current, intakeId }))} placeholder="Provided by HTU" />
        <FormInput label="Telephone" value={draft.telephone} onChange={(telephone) => setDraft((current) => ({ ...current, telephone }))} placeholder="+233 24 000 0000" />
        <div className="form-section-heading"><strong>Optional solicitor / requesting staff details</strong><span>Leave blank if you do not have a solicitor or department request.</span></div>
        <FormInput label="Solicitor / requesting staff name" value={draft.solicitorName} onChange={(solicitorName) => setDraft((current) => ({ ...current, solicitorName }))} placeholder="HTU staff member requesting you (optional)" />
        <FormInput label="Solicitor contact" value={draft.solicitorContact} onChange={(solicitorContact) => setDraft((current) => ({ ...current, solicitorContact }))} placeholder="Email or telephone (optional)" />
        <label className="form-field"><span>Requested HTU unit (optional)</span><select value={draft.requestedUnitId} onChange={(event) => setDraft((current) => ({ ...current, requestedUnitId: event.target.value }))}><option value="">No unit preference</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="form-field"><span>Position interest (optional)</span><select value={draft.positionInterest} onChange={(event) => setDraft((current) => ({ ...current, positionInterest: event.target.value }))}><option value="">No preference</option><option value="department_support">Department support</option><option value="teaching_assistant">Teaching assistant</option></select></label>
        {unitLoadError && <div className="form-alert error-alert" role="alert">Unit choices could not be loaded: {unitLoadError}</div>}
        <div className="form-alert info-alert">A unit preference or solicitor does not guarantee placement. HTU will review your application and make the final assignment.</div>
        <button className="button button-primary button-full" type="submit" disabled={submitting}>{submitting && <span className="loader small-loader" />}{submitting ? "Submitting securely…" : "Submit application"}<ArrowRight size={16} /></button>
      </form></section></div>}
    </div>
  );
}

function navIcon(item: PortalView) {
  const map: Record<PortalView, ReactNode> = {
    Overview: <LayoutDashboard size={18} />,
    "My application": <FileText size={18} />,
    "Verification queue": <ClipboardCheck size={18} />,
    "Approved personnel": <Users size={18} />,
    "Deployment management": <BriefcaseBusiness size={18} />,
    "Unit management": <LayoutDashboard size={18} />,
    Reporting: <BookOpenCheck size={18} />,
    "User management": <Users size={18} />,
    Notifications: <Bell size={18} />,
  };
  return map[item];
}

function viewDescription(view: PortalView, role: Role) {
  if (view === "My application") return "View your submitted details, status, and HR feedback.";
  if (view === "Verification queue") return role === "hr" ? "Applications available to your authorized HR permissions." : "Application records available to your account.";
  if (view === "Reporting") return "Confirm reporting for personnel in your assigned unit.";
  if (view === "Notifications") return "Important updates about your application and service.";
  return "Information available to your account, based on its permissions.";
}

function ApplicationSummary({ application, detailed = false }: { application: Application; detailed?: boolean }) {
  const status = application.applicationStatus ?? "UNKNOWN";
  const statusLabel: Record<string, string> = {
    DRAFT: "Draft", SUBMITTED: "Submitted", RESUBMITTED: "Resubmitted", CORRECTION_REQUIRED: "Correction required",
    APPROVED: "Approved", REJECTED: "Rejected",
  };
  const date = formatDate(application.submittedAt);
  return <div className={`application-summary ${detailed ? "application-details" : ""}`}>
    <div className="application-status-row"><span className={`status-pill status-${status.toLowerCase()}`}><i />{statusLabel[status] ?? status}</span><span className="updated-text">Submitted {date}</span></div>
    {application.decisionReason && <div className="decision-feedback"><strong>HR feedback</strong><p>{application.decisionReason}</p></div>}
    <div className="application-fields"><Detail label="Reference" value={application.reference ?? "Assigned after submission"} /><Detail label="Applicant name" value={application.fullName ?? "—"} /><Detail label="Programme" value={application.programme ?? "—"} /><Detail label="Intake" value={application.intakeId ?? "—"} /><Detail label="Document checks" value={application.verificationStatus ?? "Pending"} /><Detail label="Application status" value={statusLabel[status] ?? status} /></div>
  </div>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="detail-cell"><span>{label}</span><strong>{value}</strong></div>;
}

function Journey({ application }: { application: Application | null }) {
  const status = application?.applicationStatus;
  const submitted = Boolean(status && status !== "DRAFT");
  const verified = application?.verificationStatus === "VERIFIED" || status === "APPROVED";
  const deployed = ["ACTIVE", "REPORTED", "ENDED"].includes(application?.deploymentStatus ?? "");
  const reported = Boolean(application?.reportedAt) || application?.deploymentStatus === "REPORTED";
  const steps = [
    { label: "Application submitted", done: submitted, date: submitted ? "Received by HTU" : "Not submitted" },
    { label: "HR verification", done: verified, date: verified ? "Confirmed by HR" : submitted ? "Awaiting HR review" : "Starts after submission" },
    { label: "Deployment", done: deployed, date: deployed ? "Confirmed assignment" : verified ? "Awaiting assignment" : "After approval" },
    { label: "Report to supervisor", done: reported, date: reported ? `Reported ${formatDate(application?.reportedAt ?? undefined)}` : deployed ? "Awaiting report" : "After deployment" },
  ];
  return <div className="journey-list">{steps.map((step, index) => <div className={`journey-step ${step.done ? "journey-done" : ""}`} key={step.label}><span className="journey-marker">{step.done ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span><div className="journey-copy"><strong>{step.label}</strong><span>{step.date}</span></div>{index < steps.length - 1 && <i className={step.done ? "journey-line journey-line-done" : "journey-line"} />}</div>)}</div>;
}

function EmptyApplication({ onStart, role }: { onStart: () => void; role: Role }) {
  return <div className="empty-application"><span className="empty-icon"><FileText size={22} /></span><div><strong>{role === "personnel" ? "No application submitted yet" : "No applications available"}</strong><p>{role === "personnel" ? "Complete your details to begin your National Service application." : "Applications will appear here when records are available to your permissions."}</p></div>{role === "personnel" && <button className="button button-outline" onClick={onStart}>Start application <ArrowRight size={14} /></button>}</div>;
}

function ApplicationReview({ application, canReview, onReviewed }: {
  application: Application;
  canReview: boolean;
  onReviewed: () => Promise<void>;
}) {
  const [verificationStatus, setVerificationStatus] = useState(application.verificationStatus);
  const [decision, setDecision] = useState<"" | "APPROVED" | "REJECTED" | "CORRECTION_REQUIRED">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reviewable = ["SUBMITTED", "RESUBMITTED"].includes(application.applicationStatus);

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/applications/${application.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason, verificationStatus }),
      });
      await onReviewed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the application review.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="application-review">
    <h3>Personnel details</h3>
    <div className="application-fields review-fields">
      <Detail label="Full name" value={application.fullName || "—"} />
      <Detail label="Email address" value={application.personnelEmail || "Unavailable"} />
      <Detail label="Email verification" value={application.personnelEmail ? application.personnelEmailVerified ? "Verified" : "Not verified" : "Unavailable"} />
      <Detail label="NSS number" value={application.nssNumber || "No personnel record on file"} />
      <Detail label="National ID" value={application.nationalId || "No personnel record on file"} />
      <Detail label="Telephone" value={application.telephone || "—"} />
      <Detail label="Qualification" value={application.qualification || "Not recorded on this legacy application"} />
      <Detail label="Course studied" value={application.programme || "—"} />
      <Detail label="Intake" value={application.intakeId || "—"} />
      <Detail label="Document checks" value={application.verificationStatus || "PENDING"} />
      <Detail label="Position interest" value={application.positionInterest === "teaching_assistant" ? "Teaching assistant" : application.positionInterest === "department_support" ? "Department support" : "No preference"} />
      <Detail label="Requested unit" value={application.requestedUnitName || "No preference"} />
      <Detail label="Solicitor / requester" value={application.solicitorName || "Not provided"} />
      <Detail label="Solicitor contact" value={application.solicitorContact || "Not provided"} />
    </div>
    {application.decisionReason && <div className="decision-feedback"><strong>Previous review</strong><p>{application.decisionReason}</p></div>}
    {!canReview && <p className="review-readonly">Your account can view these details but does not have permission to submit a review.</p>}
    {canReview && reviewable && <form className="review-form" onSubmit={submitReview}>
      <label className="form-field"><span>Verification result</span><select value={verificationStatus} onChange={(event) => setVerificationStatus(event.target.value)}><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="REJECTED">Not verified</option></select></label>
      <label className="form-field"><span>Application decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)} required><option value="">Choose a decision</option><option value="APPROVED" disabled={verificationStatus !== "VERIFIED"}>Approve</option><option value="CORRECTION_REQUIRED">Request corrections</option><option value="REJECTED">Reject</option></select></label>
      <label className="form-field review-reason"><span>Review notes (required)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} required placeholder="Record the reason for this decision." /></label>
      {error && <div className="form-alert error-alert" role="alert">{error}</div>}
      <button className="button button-primary" type="submit" disabled={busy || !decision || !reason.trim() || (decision === "APPROVED" && verificationStatus !== "VERIFIED")}>{busy ? "Saving review…" : "Save review"}</button>
    </form>}
  </div>;
}

function ApplicationsTable({ applications, loading, error, search, canReview, onReviewed }: {
  applications: Application[];
  loading: boolean;
  error: string;
  search: string;
  canReview: boolean;
  onReviewed: () => Promise<void>;
}) {
  const [expandedApplication, setExpandedApplication] = useState("");
  const filtered = applications.filter((item) => [item.fullName, item.reference, item.programme, item.qualification, item.personnelEmail, item.applicationStatus, item.solicitorName, item.solicitorContact, item.requestedUnitName].some((value) => value?.toLowerCase().includes(search.toLowerCase())));
  return <section className="panel page-panel"><div className="panel-heading"><div><h2>Verification queue</h2><p>Open a record to review the personnel details and application status.</p></div><span className="table-count">{filtered.length} records</span></div>{error && <div className="form-alert error-alert">{error}</div>}{loading ? <LoadingLine /> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>Reference</th><th>Applicant</th><th>Programme</th><th>Submitted</th><th>Status</th><th>Details</th></tr></thead><tbody>{filtered.map((item) => <Fragment key={item.id}><tr><td>{item.reference ?? "—"}</td><td>{item.fullName ?? "—"}</td><td>{item.programme ?? "—"}</td><td>{formatDate(item.submittedAt)}</td><td><span className={`status-pill status-${(item.applicationStatus ?? "unknown").toLowerCase()}`}><i />{item.applicationStatus ?? "Unknown"}</span></td><td><button className="text-button" onClick={() => setExpandedApplication((current) => current === item.id ? "" : item.id)}>{expandedApplication === item.id ? "Close" : "Review details"}</button></td></tr>{expandedApplication === item.id && <tr><td colSpan={6}><ApplicationReview application={item} canReview={canReview} onReviewed={onReviewed} /></td></tr>}</Fragment>)}</tbody></table></div> : <EmptyState icon={<FileCheck2 />} title="No applications found" text="There are no application records available in your authorized review scope yet." />}</section>;
}

function UnitManagement() {
  const [units, setUnits] = useState<PortalUnit[]>([]);
  const [supervisors, setSupervisors] = useState<PortalSupervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ units: PortalUnit[]; supervisors: PortalSupervisor[] }>("/admin/units");
      setUnits(result.units);
      setSupervisors(result.supervisors);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load HTU units.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveUnit = async (unit: PortalUnit, supervisorId: string, active: boolean) => {
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/units/${encodeURIComponent(unit.id)}`, {
        method: "PUT",
        body: JSON.stringify({ supervisorId: supervisorId || null, active }),
      });
      setMessage(`${unit.name} saved. New deployments will use its assigned supervisor.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this unit.");
    }
  };

  const grouped = new Map<string, PortalUnit[]>();
  units.forEach((unit) => {
    const group = unit.unitType.charAt(0).toUpperCase() + unit.unitType.slice(1);
    grouped.set(group, [...(grouped.get(group) ?? []), unit]);
  });

  return <section className="panel page-panel">
    <div className="panel-heading"><div><h2>HTU units and supervisors</h2><p>Assign a supervisor to each active directorate, faculty, department, or centre.</p></div><span className="table-count">{units.length} units</span></div>
    <div className="form-alert info-alert">Create or activate a supervisor account in User management first. Assigning a supervisor also grants that person reporting access to this unit. Changes apply to new deployments.</div>
    {error && <div className="form-alert error-alert" role="alert">{error}</div>}
    {message && <div className="form-alert success-alert" role="status">{message}</div>}
    {loading ? <LoadingLine /> : !units.length ? <EmptyState icon={<BriefcaseBusiness />} title="No units found" text="Re-import database/schema.sql to create the HTU unit catalogue." /> : (
      <div className="unit-groups">{[...grouped.entries()].map(([group, groupUnits]) => <section className="unit-group" key={group}>
        <h3>{group}s</h3>
        <div className="unit-list">{groupUnits.map((unit) => <UnitAssignmentRow key={unit.id} unit={unit} supervisors={supervisors} onSave={saveUnit} />)}</div>
      </section>)}</div>
    )}
  </section>;
}

function UnitAssignmentRow({ unit, supervisors, onSave }: {
  unit: PortalUnit;
  supervisors: PortalSupervisor[];
  onSave: (unit: PortalUnit, supervisorId: string, active: boolean) => Promise<void>;
}) {
  const [supervisorId, setSupervisorId] = useState(unit.supervisorId ?? "");
  const [active, setActive] = useState(Boolean(unit.active));
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await onSave(unit, supervisorId, active); } finally { setBusy(false); }
  };
  return <form className="unit-assignment-row" onSubmit={save}>
    <div><strong>{unit.name}</strong><small>{unit.departmentId ? "Department / school" : unit.unitType}</small></div>
    <label className="form-field"><span>Supervisor</span><select value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)}><option value="">Not assigned</option>{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name} · {supervisor.email}</option>)}</select></label>
    <label className="unit-active-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active for placement</label>
    <button className="button button-outline" type="submit" disabled={busy}>{busy ? "Saving…" : "Save unit"}</button>
  </form>;
}

function DeploymentManagement({ applications, units, loading, error, onAssigned }: {
  applications: Application[];
  units: PortalUnit[];
  loading: boolean;
  error: string;
  onAssigned: () => Promise<void>;
}) {
  const approved = applications.filter((application) => application.applicationStatus === "APPROVED" && !["ACTIVE", "REPORTED"].includes(application.deploymentStatus ?? ""));
  const activeUnits = units.filter((unit) => unit.active !== false);
  const [applicationId, setApplicationId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [reportingLocation, setReportingLocation] = useState("");
  const [reportingDate, setReportingDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (applicationId && !approved.some((application) => application.id === applicationId)) setApplicationId("");
  }, [applications]);

  const selectedApplication = approved.find((application) => application.id === applicationId);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setLocalError("");
    try {
      await apiRequest("/deployments", {
        method: "POST",
        body: JSON.stringify({ applicationId, unitId, reportingLocation, reportingDate }),
      });
      setApplicationId("");
      setUnitId("");
      setReportingLocation("");
      setReportingDate("");
      await onAssigned();
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Could not assign this deployment.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="panel page-panel">
    <div className="panel-heading"><div><h2>Assign personnel to a unit</h2><p>Only HR-approved personnel can be posted. The unit’s assigned supervisor is attached automatically.</p></div></div>
    {(error || localError) && <div className="form-alert error-alert" role="alert">{localError || error}</div>}
    {loading ? <LoadingLine /> : <form className="deployment-form" onSubmit={submit}>
      <label className="form-field"><span>Approved personnel · email · qualification · course</span><select required value={applicationId} onChange={(event) => {
        const id = event.target.value;
        setApplicationId(id);
        const requestedUnitId = approved.find((application) => application.id === id)?.requestedUnitId;
        setUnitId(activeUnits.some((unit) => unit.id === requestedUnitId) ? requestedUnitId ?? "" : "");
      }}><option value="">Choose personnel</option>{approved.map((application) => <option key={application.id} value={application.id}>{application.fullName} · {application.personnelEmail || "Email unavailable"} · {application.qualification || "Qualification not recorded"} · {application.programme} · {application.reference}</option>)}</select></label>
      <label className="form-field"><span>HTU unit</span><select required value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Choose a unit</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.supervisorName ? ` · Supervisor: ${unit.supervisorName}` : " · No supervisor assigned"}</option>)}</select></label>
      {selectedApplication && <div className="deployment-request-note"><strong>Personnel request:</strong> {selectedApplication.positionInterest === "teaching_assistant" ? "Teaching assistant" : selectedApplication.positionInterest === "department_support" ? "Department support" : "No role preference"} · {selectedApplication.solicitorName || "No solicitor listed"} · Requested: {selectedApplication.requestedUnitName || "No unit preference"}</div>}
      <label className="form-field"><span>Reporting location</span><input required maxLength={240} value={reportingLocation} onChange={(event) => setReportingLocation(event.target.value)} placeholder="Building, office, or campus location" /></label>
      <label className="form-field"><span>Reporting date</span><input required type="date" value={reportingDate} onChange={(event) => setReportingDate(event.target.value)} /></label>
      {!activeUnits.length && <div className="form-alert info-alert">No active units are available. Activate units in Unit management first.</div>}
      {!approved.length && <EmptyState icon={<BriefcaseBusiness />} title="No approved personnel ready" text="Personnel appear here after an HR officer verifies and approves their application." />}
      <button className="button button-primary" type="submit" disabled={busy || !approved.length || !activeUnits.length}>{busy ? "Assigning…" : "Assign to unit"}<ArrowRight size={16} /></button>
    </form>}
  </section>;
}

const adminPermissions = [
  ["applications:read", "View applications"],
  ["applications:review", "Review applications"],
  ["personnel:read", "View personnel"],
  ["deployments:assign", "Assign deployments"],
  ["deployments:read", "View deployments"],
  ["reporting:confirm", "Confirm reporting"],
  ["reporting:read", "View reporting"],
  ["audit:read", "View audit history"],
  ["users:read", "View user records"],
] as const;

function AdminUserManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<PortalAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ users: PortalAdminUser[] }>("/admin/users");
      setUsers(result.users);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load portal accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const updateUser = (updated: PortalAdminUser) => {
    setUsers((existing) => existing.map((user) => user.uid === updated.uid ? updated : user));
  };

  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><h2>User management</h2><p>Assign account roles and only the permissions each staff member needs.</p></div>
        <span className="table-count">{users.length} accounts</span>
      </div>
      <div className="form-alert info-alert">Public registration creates personnel accounts only. Keep administrator access limited to trusted staff.</div>
      {error && <div className="form-alert error-alert" role="alert">{error}</div>}
      {loading ? <LoadingLine /> : users.length ? (
        <div className="admin-user-list">
          {users.map((user) => <AdminUserRow key={user.uid} user={user} isCurrentUser={user.uid === currentUserId} onSaved={updateUser} />)}
        </div>
      ) : <EmptyState icon={<Users />} title="No accounts found" text="Accounts will appear here after registration." />}
    </section>
  );
}

function AdminUserRow({ user, isCurrentUser, onSaved }: {
  user: PortalAdminUser;
  isCurrentUser: boolean;
  onSaved: (user: PortalAdminUser) => void;
}) {
  const [role, setRole] = useState(user.role);
  const [permissions, setPermissions] = useState(user.permissions);
  const [unitIds, setUnitIds] = useState(user.unitIds.join(", "));
  const [accountStatus, setAccountStatus] = useState(user.accountStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const togglePermission = (permission: string) => {
    setPermissions((existing) => existing.includes(permission)
      ? existing.filter((item) => item !== permission)
      : [...existing, permission]);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(user.uid)}`, {
        method: "PUT",
        body: JSON.stringify({
          role,
          permissions,
          unitIds: role === "supervisor" ? unitIds.split(",").map((unit) => unit.trim()).filter(Boolean) : [],
          accountStatus,
        }),
      });
      onSaved({ ...user, role, permissions, unitIds: role === "supervisor" ? unitIds.split(",").map((unit) => unit.trim()).filter(Boolean) : [], accountStatus });
      setMessage("Access settings saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save access settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-user-row" onSubmit={save}>
      <div className="admin-user-heading">
        <div><strong>{user.displayName}</strong><span>{user.email}{isCurrentUser ? " · You" : ""}</span></div>
        <span className={`status-pill status-${user.accountStatus}`}><i />{user.accountStatus}</span>
      </div>
      <div className="admin-user-fields">
        <label className="form-field"><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as PortalUser["role"])}><option value="personnel">Personnel</option><option value="hr">HR officer</option><option value="supervisor">Supervisor</option><option value="administrator">Administrator</option></select></label>
        <label className="form-field"><span>Account status</span><select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value as PortalAdminUser["accountStatus"])}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
        {role === "supervisor" && <label className="form-field admin-units-field"><span>Assigned unit IDs (comma separated)</span><input value={unitIds} onChange={(event) => setUnitIds(event.target.value)} placeholder="unit-ho-hr, unit-registry" /></label>}
      </div>
      <div className="admin-permissions" aria-label={`Permissions for ${user.email}`}>
        {adminPermissions.map(([permission, label]) => <label key={permission}><input type="checkbox" checked={permissions.includes(permission)} onChange={() => togglePermission(permission)} />{label}</label>)}
      </div>
      {error && <div className="form-alert error-alert" role="alert">{error}</div>}
      {message && <div className="form-alert success-alert" role="status">{message}</div>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save access"}</button>
      <small className="admin-user-meta">{user.emailVerified ? "Email verified" : "Email not verified"} · Created {formatDate(user.createdAt)}</small>
    </form>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}

function LoadingLine() {
  return <div className="loading-block"><span className="loader" />Loading secure portal data…</div>;
}

export default App;
