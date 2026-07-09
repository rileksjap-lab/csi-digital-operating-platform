"use client";

import { useState, useEffect } from "react";
import { apiFetcher } from "@/lib/api/fetcher";

interface Department {
  id: string;
  deptCode: string;
  deptName: string;
}

type Step = "form" | "submitted";

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("form");
  const [departments, setDepartments] = useState<Department[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [deptId, setDeptId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetcher<Department[]>("/api/auth/departments")
      .then(setDepartments)
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, deptId }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Registration failed");
        return;
      }
      setStep("submitted");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary-700 mb-1">CSI DOP</h1>
          <p className="text-sm text-gray-500">Register your account</p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                placeholder="Ahmad bin Ali"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <select
                id="department"
                required
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none bg-white"
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.deptName} ({d.deptCode})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !name || !email || !deptId}
              className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Submitting..." : "Submit registration"}
            </button>
          </form>
        )}

        {step === "submitted" && (
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Registration submitted</h2>
            <p className="text-sm text-gray-600">
              Your account is pending admin approval. You&apos;ll be notified once approved.
            </p>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500 mb-2">Already have an account?</p>
          <a
            href="/login"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Sign in
          </a>
        </div>

        <p className="mt-6 text-xs text-gray-400 text-center">
          10 Creative Solutions Sdn Bhd
        </p>
      </div>
    </main>
  );
}
