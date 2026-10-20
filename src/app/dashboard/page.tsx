import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Calendar, Clock, CheckCircle, PlusCircle, Users } from "lucide-react";
import { accruedAnnualLeave, countTunisianWorkingDays } from "@/lib/tunisia-calendar";

export const instant = false;

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Profil de l'utilisateur
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, teams(name)")
    .eq("id", user?.id)
    .single();

  // Soldes de l'utilisateur
  const { data: balances } = await supabase
    .from("leave_balances")
    .select("*, leave_types(name, color_code)")
    .eq("user_id", user?.id);

  // Demandes personnelles de l'utilisateur
  const { data: myRequests } = await supabase
    .from("leave_requests")
    .select("*, leave_types(name)")
    .eq("user_id", user?.id)
    .order("created_at", { ascending: false });

  const year = new Date().getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("holiday_date")
    .gte("holiday_date", yearStart)
    .lte("holiday_date", yearEnd);
  const annualUsed = (myRequests ?? [])
    .filter((request) => request.status === "APPROVED" && request.leave_types?.name === "Congé annuel")
    .reduce((sum, request) => {
      const start = request.start_date < yearStart ? yearStart : request.start_date;
      const end = request.end_date > yearEnd ? yearEnd : request.end_date;
      if (end < yearStart || start > yearEnd) return sum;
      return sum + countTunisianWorkingDays(
        start,
        end,
        request.half_day ?? "NONE",
        holidays?.map((holiday) => holiday.holiday_date) ?? [],
      );
    }, 0);
  const annualAvailable = accruedAnnualLeave(new Date(), profile?.hire_date) - annualUsed;

  // Congés approuvés de toute l'équipe (grâce aux règles RLS de Supabase)
  const { data: teamApprovedLeaves } = await supabase
    .from("leave_requests")
    .select("*, profiles(full_name), leave_types(name, color_code)")
    .eq("status", "APPROVED")
    .neq("user_id", user?.id)
    .order("start_date", { ascending: true });

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b bg-white p-6 rounded-lg shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Bonjour, {profile?.full_name || "Employé"}</h1>
          <p className="text-muted-foreground">
            Équipe : <span className="font-semibold text-primary">{profile?.teams?.name || "Non assignée"}</span> | Rôle : {profile?.role}
          </p>
        </div>
        <div className="flex gap-2">
          {profile?.role === "MANAGER" && (
            <Link href="/manager/approvals">
              <Button variant="outline">Valider les congés d'équipe</Button>
            </Link>
          )}
          {profile?.role === "DRH" && (
            <Link href="/admin/users">
              <Button variant="outline">Administration DRH</Button>
            </Link>
          )}
          <Link href="/requests/new">
            <Button className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              Nouvelle demande
            </Button>
          </Link>
        </div>
      </div>

      {/* Cartes de soldes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {balances?.map((b) => (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{b.leave_types?.name}</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {b.leave_types?.name === "Congé annuel" ? annualAvailable.toLocaleString("fr-TN", { maximumFractionDigits: 1 }) : b.allocated_days} j.
              </div>
              <p className="text-xs text-muted-foreground">
                {b.leave_types?.name === "Congé annuel" ? `acquis à raison de 2,5 j/mois (${annualUsed} j approuvés)` : "Droit annuel"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mes dernières demandes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" /> Mes Demandes Récentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myRequests && myRequests.length > 0 ? (
              <div className="space-y-4">
                {myRequests.map((req) => (
                  <div key={req.id} className="flex justify-between items-center p-3 border rounded-lg bg-white">
                    <div>
                      <p className="font-semibold">{req.leave_types?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Du {new Date(req.start_date).toLocaleDateString()} au {new Date(req.end_date).toLocaleDateString()} ({req.total_days} j.)
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full font-semibold ${
                      req.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                      req.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Aucune demande soumise.</p>
            )}
          </CardContent>
        </Card>

        {/* Congés approuvés de l'équipe */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" /> Congés Approuvés de l'Équipe
            </CardTitle>
          </CardHeader>
          <CardContent>
            {teamApprovedLeaves && teamApprovedLeaves.length > 0 ? (
              <div className="space-y-4">
                {teamApprovedLeaves.map((req) => (
                  <div key={req.id} className="flex justify-between items-center p-3 border rounded-lg bg-white">
                    <div>
                      <p className="font-semibold">{req.profiles?.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Du {new Date(req.start_date).toLocaleDateString()} au {new Date(req.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-semibold">
                      {req.leave_types?.name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Aucun congé approuvé pour le moment dans l'équipe.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
