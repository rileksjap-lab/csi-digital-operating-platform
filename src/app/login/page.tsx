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
    <main className="relative flex min-h-screen overflow-hidden bg-[#0a0e1a]">
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-red-600/20 to-transparent blur-3xl animate-pulse" style={{ animationDuration: "6s" }} />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-orange-500/10 to-transparent blur-3xl animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full bg-gradient-to-br from-blue-600/10 to-transparent blur-3xl animate-pulse" style={{ animationDuration: "10s" }} />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Left: Brand content */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-16 z-10">
        <div>
          <div className="flex items-center gap-4 mb-20">
            <img src="/logo-10cs.svg" alt="10CS" width={52} height={44} />
            <div className="h-8 w-px bg-white/20" />
            <span className="text-sm font-semibold text-white/70 tracking-widest uppercase">CSI Department</span>
          </div>

          <h1 className="text-5xl font-extrabold text-white leading-[1.1] mb-6 tracking-tight">
            Digital Operating<br />
            <span className="bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">Platform</span>
          </h1>
          <p className="text-lg text-white/40 max-w-lg leading-relaxed">
            One unified system for work orders, tenders, capacity planning, and performance tracking.
          </p>
        </div>

        {/* Stats row */}
        <div className="flex gap-12">
          {[
            { value: "5", label: "Modules" },
            { value: "19", label: "Screens" },
            { value: "24/7", label: "Access" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-xs text-white/30 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex flex-1 items-center justify-center relative z-10 px-6 lg:px-16">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="text-center mb-10 lg:hidden">
            <img src="/logo-10cs.svg" alt="10CS" width={48} height={40} className="mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white">CSI Digital Operating Platform</h2>
          </div>

          {/* Glass card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl p-10 shadow-2xl shadow-black/20">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">
                {step === "email" ? "Welcome back" : step === "otp" ? "Enter verification code" : "You're in"}
              </h2>
              <p className="text-sm text-white/40">
                {step === "email"
                  ? "Sign in to your account to continue"
                  : step === "otp"
                    ? <>Code sent to <span className="text-white/70">{email}</span></>
                    : "Redirecting to your dashboard..."}
              </p>
            </div>

            {error && (
              <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {step === "email" && (
              <form onSubmit={handleRequestOtp} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3.5 text-white placeholder-white/20 outline-none transition-all focus:border-red-500/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-red-500/30"
                    placeholder="you@company.com"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-red-500 hover:to-orange-500 hover:shadow-lg hover:shadow-red-500/25 disabled:opacity-40 disabled:hover:shadow-none"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Sending code...
                    </span>
                  ) : "Continue with email"}
                </button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                {devCode && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
                    <p className="text-[10px] text-amber-400/70 font-medium uppercase tracking-widest mb-2">Dev Mode — Your code</p>
                    <p className="text-3xl font-bold font-mono tracking-[0.4em] text-amber-400">{devCode}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="code" className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">
                    6-digit code
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
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3.5 text-center text-2xl font-mono tracking-[0.5em] text-white placeholder-white/20 outline-none transition-all focus:border-red-500/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-red-500/30"
                    placeholder="••••••"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-red-500 hover:to-orange-500 hover:shadow-lg hover:shadow-red-500/25 disabled:opacity-40 disabled:hover:shadow-none"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Verifying...
                    </span>
                  ) : "Verify & sign in"}
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setCode(""); setError(""); }}
                    className="text-white/30 hover:text-white/60 transition-colors"
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCode(""); setError(""); handleRequestOtp(new Event("submit") as unknown as React.FormEvent); }}
                    className="text-white/30 hover:text-white/60 transition-colors"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}

            {step === "success" && (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20 mb-4">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-green-400">Signed in successfully. Redirecting...</p>
              </div>
            )}
          </div>

          {/* Dev login + register links below card */}
          <div className="mt-6 space-y-4">
            {process.env.NODE_ENV === "development" && (
              <a
                href="/api/auth/login"
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Dev Login (dev@csidop.local)
              </a>
            )}

            <p className="text-center text-xs text-white/20">
              Don&apos;t have an account?{" "}
              <a href="/register" className="text-red-400/70 hover:text-red-400 transition-colors">
                Register here
              </a>
            </p>
          </div>

          {/* Footer */}
          <p className="mt-10 text-center text-[11px] text-white/15">
            &copy; {new Date().getFullYear()} 10 Creative Solutions Sdn Bhd
          </p>
        </div>
      </div>
    </main>
  );
}
