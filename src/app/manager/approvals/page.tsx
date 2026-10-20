import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateRequestStatus } from "@/lib/actions/leave-requests";
import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";

export const instant = false;

export default async function ManagerApprovalsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Profil du manager pour vérifier son équipe
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id")
    .eq("id", user?.id)
    .single();

  if (profile?.role !== "MANAGER" && profile?.role !== "DRH") {
    return (
      <div className="p-6">
        <p className="text-destructive font-semibold">Accès refusé. Vous devez être Manager pour accéder à cette page.</p>
      </div>
    );
  }

  // Récupération des demandes en attente de l'équipe
  const { data: pendingRequests } = await supabase
    .from("leave_requests")
    .select("*, profiles(full_name, email), leave_types(name)")
    .eq("team_id", profile.team_id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Validation des Congés de l'Équipe</h1>
          <p className="text-muted-foreground">Approuvez ou refusez les demandes soumises par vos collaborateurs.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demandes en Attente ({pendingRequests?.length || 0})</CardTitle>
          <CardDescription>Traitez les demandes prioritaires ci-dessous.</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRequests && pendingRequests.length > 0 ? (
            <div className="space-y-4">
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border rounded-lg bg-white gap-4">
                  <div>
                    <h3 className="font-bold text-lg">{req.profiles?.full_name}</h3>
                    <p className="text-sm text-muted-foreground">{req.profiles?.email}</p>
                    <div className="mt-2 text-sm">
                      <span className="font-semibold">{req.leave_types?.name}</span> : du{" "}
                      {new Date(req.start_date).toLocaleDateString()} au {new Date(req.end_date).toLocaleDateString()} ({req.total_days} jours)
                    </div>
                    {req.reason && (
                      <p className="text-sm mt-1 text-gray-600 bg-gray-50 p-2 rounded">
                        <span className="font-medium">Motif :</span> {req.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={async () => {
                      "use server";
                      await updateRequestStatus(req.id, "APPROVED");
                    }}>
                      <Button variant="default" className="bg-green-600 hover:bg-green-700 flex items-center gap-1">
                        <Check className="h-4 w-4" /> Approuver
                      </Button>
                    </form>
                    <form action={async () => {
                      "use server";
                      await updateRequestStatus(req.id, "REJECTED", "Non précisé");
                    }}>
                      <Button variant="destructive" className="flex items-center gap-1">
                        <X className="h-4 w-4" /> Refuser
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Aucune demande en attente pour votre équipe.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
