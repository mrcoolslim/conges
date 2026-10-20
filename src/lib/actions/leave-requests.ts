"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaveRequestSchema, LeaveRequestFormValues } from "@/lib/validations/leave";
import { revalidatePath } from "next/cache";
import { countTunisianWorkingDays } from "@/lib/tunisia-calendar";

export async function submitLeaveRequest(data: LeaveRequestFormValues) {
  const result = LeaveRequestSchema.safeParse(data);
  if (!result.success) {
    return { error: "Données invalides", details: result.error.format() };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Non autorisé" };

  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("holiday_date")
    .gte("holiday_date", data.start_date)
    .lte("holiday_date", data.end_date);
  const totalDays = countTunisianWorkingDays(
    data.start_date,
    data.end_date,
    data.half_day,
    holidays?.map((holiday) => holiday.holiday_date) ?? [],
  );
  if (totalDays <= 0) return { error: "La période ne contient aucun jour ouvré tunisien." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.from("leave_requests").insert({
    user_id: user.id,
    team_id: profile?.team_id,
    leave_type_id: data.leave_type_id,
    start_date: data.start_date,
    end_date: data.end_date,
    half_day: data.half_day,
    total_days: totalDays,
    reason: data.reason,
  });

  if (error) return { error: "Erreur lors de la soumission", details: error };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateRequestStatus(requestId: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Non autorisé" };
    const { data, error } = await supabase
        .from("leave_requests")
        .update({ status, rejection_reason: rejectionReason, reviewer_id: user.id, updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .select("id")
        .maybeSingle();

    if (error || !data) return { error: "Erreur de mise à jour ou droits insuffisants" };

    revalidatePath("/manager/approvals");
    revalidatePath("/dashboard");
    return { success: true };
}
