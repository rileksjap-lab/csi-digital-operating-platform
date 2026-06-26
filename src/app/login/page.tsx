"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "email" | "otp" | "success";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState("");

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Failed to send OTP");
        return;
      }
      if (json.data?.devCode) {
        setDevCode(json.data.devCode);
      }
      setStep("otp");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Invalid code");
        return;
      }
      setStep("success");
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-navy-900 p-12">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <img src="/logo-10cs.svg" alt="10CS" width={48} height={40} />
            <span className="text-lg font-bold text-white tracking-wide">CSI Digital Operating Platform</span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Digital Operating<br />Platform
          </h2>
          <p className="text-navy-300 text-sm leading-relaxed max-w-md">
            Streamline work orders, track tenders, manage capacity, and monitor KPIs
            — all in one unified platform for the CSI department.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/20">
              <svg className="h-4 w-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm text-navy-200">Work Order Management</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-500/20">
              <svg className="h-4 w-4 text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-sm text-navy-200">Capacity Planning</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20">
              <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-sm text-navy-200">KPI Tracking & Analytics</span>
          </div>
          <p className="text-xs text-navy-500 pt-4">10 Creative Solutions Sdn Bhd</p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8 lg:hidden">
            <div className="flex items-center justify-center gap-2 mb-3">
              <img src="/logo-10cs.svg" alt="10CS" width={40} height={34} />
              <span className="text-base font-bold text-navy-900">CSI Digital Operating Platform</span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-gray-900 mb-1">Sign in</h1>
              <p className="text-sm text-gray-500">Enter your email to get started</p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-danger-50 border border-danger-100 p-3 text-sm text-danger-700">
                {error}
              </div>
            )}

            {step === "email" && (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field py-2.5"
                    placeholder="you@company.com"
                  />
                </div>
                <button type="submit" disabled={loading || !email} className="btn-primary w-full py-2.5">
                  {loading ? "Sending..." : "Send login code"}
                </button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-sm text-gray-600 text-center">
                  We sent a 6-digit code to <strong>{email}</strong>
                </p>
                {devCode && (
                  <div className="rounded-lg bg-accent-50 border border-accent-200 p-3 text-center">
                    <p className="text-xs text-accent-600 font-medium mb-1">DEV MODE — Your code:</p>
                    <p className="text-2xl font-bold font-mono tracking-[0.3em] text-accent-700">{devCode}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Login code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="input-field py-2.5 text-center tracking-[0.3em] font-mono text-lg"
                    placeholder="000000"
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={loading || code.length !== 6} className="btn-primary w-full py-2.5">
                  {loading ? "Verifying..." : "Verify & sign in"}
                </button>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setCode(""); setError(""); }}
                    className="hover:text-accent-600"
                  >
                    Use a different email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCode(""); setError(""); handleRequestOtp(new Event("submit") as unknown as React.FormEvent); }}
                    className="hover:text-accent-600"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}

            {step === "success" && (
              <div className="text-center text-sm text-success-700">
                <p>Signed in! Redirecting...</p>
              </div>
            )}

            {process.env.NODE_ENV === "development" && (
              <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-500 mb-2">Development Mode</p>
                <a
                  href="/api/auth/login"
                  className="inline-flex items-center justify-center rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 transition-colors w-full"
                >
                  Dev Login (dev@csidop.local)
                </a>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-500 mb-2">Don&apos;t have an account?</p>
              <a
                href="/register"
                className="text-sm font-medium text-accent-600 hover:text-accent-700"
              >
                Register here
              </a>
            </div>
          </div>

          <p className="mt-6 text-xs text-gray-400 text-center lg:hidden">
            10 Creative Solutions Sdn Bhd
          </p>
        </div>
      </div>
    </main>
  );
}
