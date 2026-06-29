"use client";

import { useRef, useState } from "react";

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

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "PDF";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["xls", "xlsx"].includes(ext)) return "XLS";
  if (["ppt", "pptx"].includes(ext)) return "PPT";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "IMG";
  if (["zip", "rar"].includes(ext)) return "ZIP";
  return "FILE";
}

export default function WoEvidencePanel({
  woId,
  canUpload,
  woClosed,
  evidenceItems,
  onSuccess,
}: WoEvidencePanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] = useState(EVIDENCE_TYPES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${formatFileSize(file.size)}). Maximum is 20 MB.`);
      return;
    }
    setError(null);
    setSelectedFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    setError(null);
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("woId", woId);
      formData.append("evidenceType", evidenceType);

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        body: formData,
      });

      if (res.status === 401) {
        window.location.href = "/api/auth/login";
        return;
      }

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message ?? "Upload failed");
      }

      setSelectedFile(null);
      setEvidenceType(EVIDENCE_TYPES[0]);
      setShowForm(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      {canUpload && !woClosed && (
        <div className="border-b border-gray-200 px-4 py-3">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Upload Evidence
            </button>
          ) : (
            <form onSubmit={handleUpload} className="space-y-3">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
                  dragOver
                    ? "border-primary-400 bg-primary-50"
                    : selectedFile
                    ? "border-green-300 bg-green-50"
                    : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleInputChange}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.rar"
                />
                {selectedFile ? (
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-primary-100 px-2 py-1 text-xs font-bold text-primary-700">
                      {fileIcon(selectedFile.name)}
                    </span>
                    <div className="text-sm">
                      <p className="font-medium text-gray-800">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="ml-2 text-gray-400 hover:text-red-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <svg className="mb-2 h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium text-primary-600">Click to browse</span> or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      PDF, DOC, XLS, PPT, Images, ZIP — max 20 MB
                    </p>
                  </>
                )}
              </div>

              {/* Type + buttons */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Evidence Type</label>
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
                  disabled={submitting || !selectedFile}
                  className="inline-flex items-center gap-1.5 rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    "Upload"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setSelectedFile(null);
                    setError(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
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
            {evidenceItems.map((ev) => {
              const filename = ev.fileRef.split("/").pop() ?? ev.fileRef;
              const displayName = filename.includes("-")
                ? filename.substring(filename.indexOf("-") + 1)
                : filename;
              return (
                <tr key={ev.id}>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
                        {fileIcon(displayName)}
                      </span>
                      {ev.evidenceType}
                    </span>
                  </td>
                  <td className="px-4 py-2 max-w-[200px]">
                    <a
                      href={`/api/evidence/${ev.id}/download`}
                      className="truncate block text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
                      title={displayName}
                    >
                      {displayName}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{ev.uploadedByName}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(ev.uploadedDate).toLocaleDateString("en-MY")}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <a
                      href={`/api/evidence/${ev.id}/download`}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium mr-3"
                    >
                      Download
                    </a>
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
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
