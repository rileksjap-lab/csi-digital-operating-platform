"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api/fetcher";

interface EvidenceItem {
  id: string;
  fileRef: string;
  evidenceType: string;
  uploadedByName: string;
  uploadedDate: string;
}

interface WoEvidencePanelProps {
  woId: string;
  canUpload: boolean;
  woClosed: boolean;
  evidenceItems: EvidenceItem[];
  onSuccess: () => void;
}

const EVIDENCE_TYPES = [
  "Deliverable",
  "Screenshot",
  "Report",
  "Design Document",
  "Meeting Minutes",
  "Sign-off",
  "Other",
];

export default function WoEvidencePanel({
  woId,
  canUpload,
  woClosed,
  evidenceItems,
  onSuccess,
}: WoEvidencePanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [filename, setFilename] = useState("");
  const [evidenceType, setEvidenceType] = useState(EVIDENCE_TYPES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Step 1: Get upload intent
      const intent = await apiPost<{
        uploadIntentId: string;
        presignedUrl: string;
        fileRef: string;
      }>("/api/evidence/upload-url", {
        woId,
        filename: filename.trim(),
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
      });

      // Step 2: In production, the binary would be PUT to intent.presignedUrl here.
      // For dev, we skip the actual binary upload.

      // Step 3: Confirm
      await apiPost("/api/evidence/confirm", {
        uploadIntentId: intent.uploadIntentId,
        evidenceType,
      });

      setFilename("");
      setEvidenceType(EVIDENCE_TYPES[0]);
      setShowForm(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(evidenceId: string) {
    setDeleting(evidenceId);
    try {
      const res = await fetch(`/api/evidence/${evidenceId}`, { method: "DELETE" });
      if (res.status === 401) {
        window.location.href = "/api/auth/login";
        return;
      }
      if (res.status !== 204) {
        const json = await res.json();
        throw new Error(json.error?.message ?? "Failed to remove");
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {/* Upload button / form */}
      {canUpload && !woClosed && (
        <div className="border-b border-gray-200 px-4 py-3">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              Upload Evidence
            </button>
          ) : (
            <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600">
                  Filename <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  maxLength={200}
                  className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  placeholder="report.pdf"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  Type
                </label>
                <select
                  value={evidenceType}
                  onChange={(e) => setEvidenceType(e.target.value)}
                  className="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                >
                  {EVIDENCE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting || !filename.trim()}
                className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {submitting ? "Uploading..." : "Upload"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(null); }}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </form>
          )}
          {error && (
            <div className="mt-2 text-sm text-red-600">{error}</div>
          )}
        </div>
      )}

      {/* Evidence table */}
      {evidenceItems.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No evidence attached
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">File</th>
              <th className="px-4 py-2 text-left">Uploaded By</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {evidenceItems.map((ev) => (
              <tr key={ev.id}>
                <td className="px-4 py-2">{ev.evidenceType}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500 truncate max-w-[200px]">
                  {ev.fileRef.split("/").pop() ?? ev.fileRef}
                </td>
                <td className="px-4 py-2 text-gray-500">{ev.uploadedByName}</td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(ev.uploadedDate).toLocaleDateString("en-MY")}
                </td>
                <td className="px-4 py-2 text-right">
                  {!woClosed && (
                    <button
                      onClick={() => handleDelete(ev.id)}
                      disabled={deleting === ev.id}
                      className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      {deleting === ev.id ? "Removing..." : "Remove"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
