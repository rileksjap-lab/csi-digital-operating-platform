"use client";

import Link from "next/link";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

interface ProfileData {
  id: string;
  staffCode: string;
  name: string;
  email: string;
  roleCode: string;
  roleName: string;
  deptCode: string;
  deptName: string;
  subTeam: string | null;
  productivityFactor: number;
  dailyUsableHours: number;
  status: string;
  createdAt: string;
  skills: {
    skillName: string;
    domain: string;
    competencyLevel: number;
    lastAssessmentDate: string;
  }[];
  certifications: {
    certificationName: string;
    issuingBody: string;
    issueDate: string | null;
    expiryDate: string | null;
    status: string;
  }[];
  effortSummary: {
    totalHours: number;
    totalEntries: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Inactive: "bg-gray-100 text-gray-600",
  OnLeave: "bg-yellow-100 text-yellow-700",
};

const CERT_STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Expired: "bg-red-100 text-red-700",
  Revoked: "bg-gray-100 text-gray-600",
};

const COMPETENCY_LABELS: Record<number, string> = {
  1: "Beginner",
  2: "Intermediate",
  3: "Advanced",
  4: "Expert",
  5: "Master",
};

export default function ProfilePage() {
  const { data: profile, error } = useSWR<ProfileData>("/api/profile", apiFetcher);

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load profile
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">My Profile</h1>

      {/* Profile header card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700">
            {initials}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{profile.name}</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[profile.status] ?? "bg-gray-100 text-gray-600"}`}
              >
                {profile.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">{profile.email}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-xs text-gray-400">Staff Code</span>
                <p className="font-mono font-medium text-gray-700">{profile.staffCode}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Role</span>
                <p className="font-medium text-gray-700">{profile.roleName}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Department</span>
                <p className="font-medium text-gray-700">{profile.deptName} ({profile.deptCode})</p>
              </div>
              {profile.subTeam && (
                <div>
                  <span className="text-xs text-gray-400">Sub-team / Pod</span>
                  <p className="font-medium text-gray-700">{profile.subTeam}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-400">Productivity Factor</span>
                <p className="font-medium text-gray-700">{(profile.productivityFactor * 100).toFixed(0)}%</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Daily Usable Hours</span>
                <p className="font-medium text-gray-700">{profile.dailyUsableHours}h</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">Total Effort Logged</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{profile.effortSummary.totalHours.toFixed(1)}h</p>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{profile.effortSummary.totalEntries} entries</p>
            <Link href="/profile/effort-log" className="text-xs font-medium text-primary-600 hover:underline">
              View all &rarr;
            </Link>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">Skills</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{profile.skills.length}</p>
          <p className="text-xs text-gray-400">
            {Array.from(new Set(profile.skills.map((s) => s.domain))).length} domains
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">Certifications</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{profile.certifications.length}</p>
          <p className="text-xs text-gray-400">
            {profile.certifications.filter((c) => c.status === "Active").length} active
          </p>
        </div>
      </div>

      {/* Skills section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">Skills & Competencies</h3>
        {profile.skills.length === 0 ? (
          <p className="text-sm text-gray-400">No skills recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="pb-2 pr-4">Skill</th>
                  <th className="pb-2 pr-4">Domain</th>
                  <th className="pb-2 pr-4">Competency</th>
                  <th className="pb-2">Last Assessed</th>
                </tr>
              </thead>
              <tbody>
                {profile.skills.map((skill) => (
                  <tr key={`${skill.domain}-${skill.skillName}`} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium text-gray-700">{skill.skillName}</td>
                    <td className="py-2 pr-4 text-gray-500">{skill.domain}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <div
                              key={level}
                              className={`h-2 w-4 rounded-sm ${
                                level <= skill.competencyLevel
                                  ? "bg-primary-500"
                                  : "bg-gray-200"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">
                          {COMPETENCY_LABELS[skill.competencyLevel] ?? `Level ${skill.competencyLevel}`}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 text-gray-500">
                      {skill.lastAssessmentDate && skill.lastAssessmentDate !== "null"
                        ? new Date(skill.lastAssessmentDate).toLocaleDateString("en-MY", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Certifications section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">Certifications</h3>
        {profile.certifications.length === 0 ? (
          <p className="text-sm text-gray-400">No certifications recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {profile.certifications.map((cert) => {
              const isExpiringSoon =
                cert.status === "Active" &&
                cert.expiryDate &&
                new Date(cert.expiryDate).getTime() - Date.now() < 90 * 24 * 60 * 60 * 1000;
              return (
                <div
                  key={`${cert.certificationName}-${cert.issuingBody}`}
                  className={`rounded-lg border p-4 ${
                    isExpiringSoon
                      ? "border-yellow-200 bg-yellow-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{cert.certificationName}</p>
                      <p className="text-xs text-gray-500">{cert.issuingBody}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${CERT_STATUS_COLORS[cert.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {cert.status}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-gray-400">
                    {cert.issueDate && (
                      <span>
                        Issued:{" "}
                        {new Date(cert.issueDate).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    {cert.expiryDate && (
                      <span className={isExpiringSoon ? "text-yellow-600 font-medium" : ""}>
                        Expires:{" "}
                        {new Date(cert.expiryDate).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {isExpiringSoon && " (expiring soon)"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-300">
        Member since{" "}
        {new Date(profile.createdAt).toLocaleDateString("en-MY", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
