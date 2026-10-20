"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitLeaveRequest } from "@/lib/actions/leave-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { countTunisianWorkingDays } from "@/lib/tunisia-calendar";

export default function NewLeaveRequestPage() {
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState<"NONE" | "MORNING" | "AFTERNOON">("NONE");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function fetchTypes() {
      const { data } = await supabase.from("leave_types").select("*");
      if (data && data.length > 0) {
        setLeaveTypes(data);
        setLeaveTypeId(data[0].id);
      }
      const { data: holidayData } = await supabase.from("public_holidays").select("holiday_date");
      setHolidays(holidayData?.map((holiday) => holiday.holiday_date) ?? []);
    }
    fetchTypes();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await submitLeaveRequest({
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      half_day: halfDay,
      reason,
    });

    if (res?.error) {
      setError(res.error);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex justify-center items-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/dashboard" className="text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="text-sm text-muted-foreground">Retour au tableau de bord</span>
          </div>
          <CardTitle className="text-2xl font-bold">Nouvelle Demande de Congé</CardTitle>
          <CardDescription>
            Les jours sont calculés selon le calendrier tunisien, hors week-ends et jours fériés fixes.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Type de congé</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
                required
              >
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date de début</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date de fin</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            {startDate && endDate && (
              <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900" aria-live="polite">
                Durée estimée : <strong>{countTunisianWorkingDays(startDate, endDate, halfDay, holidays)} jour(s) ouvré(s)</strong>.
              </p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Option demi-journée</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={halfDay}
                onChange={(e) => setHalfDay(e.target.value as any)}
              >
                <option value="NONE">Journée(s) entière(s)</option>
                <option value="MORNING">Matinée uniquement</option>
                <option value="AFTERNOON">Après-midi uniquement</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Motif (optionnel)</label>
              <Input
                placeholder="Raison du congé..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Soumission..." : "Soumettre la demande"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
