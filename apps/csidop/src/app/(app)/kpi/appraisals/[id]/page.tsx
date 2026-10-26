"use client";

import { useParams } from "next/navigation";
import AppraisalForm from "@/components/kpi/appraisal-form";

export default function AppraisalPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  return <AppraisalForm id={params.id} />;
}
