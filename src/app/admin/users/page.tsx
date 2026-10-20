import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Shield, Users } from "lucide-react";
import { revalidatePath } from "next/cache";
import { Input } from "@/components/ui/input";

export const instant = false;

export default async function AdminUsersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Vérifier si l'utilisateur est DRH
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id)
    .single();

  if (profile?.role !== "DRH") {
    return (
      <div className="p-6">
        <p className="text-destructive font-semibold">Accès refusé. Réservé au DRH.</p>
      </div>
    );
  }

  // Récupérer tous les utilisateurs et équipes
  const { data: users } = await supabase
    .from("profiles")
    .select("*, teams(name)")
    .order("full_name");

  const { data: teams } = await supabase.from("teams").select("*");
  const { data: holidays } = await supabase.from("public_holidays").select("*").order("holiday_date");

  async function updateUserRoleAndTeam(formData: FormData) {
    "use server";
    const userId = formData.get("userId") as string;
    const role = formData.get("role") as string;
    const teamId = formData.get("teamId") as string;
    const hireDate = String(formData.get("hireDate") ?? "");

    const supabaseAdmin = await createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabaseAdmin.auth.getUser();
    if (!currentUser || !["EMPLOYEE", "MANAGER", "DRH"].includes(role) || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return;
    const { data: currentProfile } = await supabaseAdmin.from("profiles").select("role").eq("id", currentUser.id).single();
    if (currentProfile?.role !== "DRH") return;
    await supabaseAdmin
      .from("profiles")
      .update({ role, team_id: teamId || null, hire_date: hireDate })
      .eq("id", userId);

    revalidatePath("/admin/users");
  }

  async function addPublicHoliday(formData: FormData) {
    "use server";
    const holidayDate = String(formData.get("holidayDate") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const supabaseAdmin = await createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabaseAdmin.auth.getUser();
    if (!currentUser || !/^\d{4}-\d{2}-\d{2}$/.test(holidayDate) || !name || name.length > 100) return;
    const { data: currentProfile } = await supabaseAdmin.from("profiles").select("role").eq("id", currentUser.id).single();
    if (currentProfile?.role !== "DRH") return;
    await supabaseAdmin.from("public_holidays").upsert({ holiday_date: holidayDate, name });
    revalidatePath("/admin/users");
    revalidatePath("/requests/new");
  }

  async function removePublicHoliday(formData: FormData) {
    "use server";
    const holidayDate = String(formData.get("holidayDate") ?? "");
    const supabaseAdmin = await createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabaseAdmin.auth.getUser();
    if (!currentUser || !/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) return;
    const { data: currentProfile } = await supabaseAdmin.from("profiles").select("role").eq("id", currentUser.id).single();
    if (currentProfile?.role !== "DRH") return;
    await supabaseAdmin.from("public_holidays").delete().eq("holiday_date", holidayDate);
    revalidatePath("/admin/users");
    revalidatePath("/requests/new");
  }

  async function createTeam(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    if (!name || name.length > 100 || !/^[A-Z0-9_-]{2,20}$/.test(code)) return;
    const supabaseAdmin = await createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabaseAdmin.auth.getUser();
    if (!currentUser) return;
    const { data: currentProfile } = await supabaseAdmin.from("profiles").select("role").eq("id", currentUser.id).single();
    if (currentProfile?.role !== "DRH") return;
    await supabaseAdmin.from("teams").insert({ name, code });
    revalidatePath("/admin/users");
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Administration DRH
          </h1>
          <p className="text-muted-foreground">Gestion des collaborateurs, des rôles et des affectations d'équipe.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Équipes</CardTitle>
          <CardDescription>Créez une équipe, puis affectez-y ses collaborateurs et son manager.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createTeam} className="flex flex-col sm:flex-row gap-3">
            <Input name="name" maxLength={100} required placeholder="Nom de l'équipe" aria-label="Nom de l'équipe" />
            <Input name="code" maxLength={20} minLength={2} required placeholder="CODE" aria-label="Code de l'équipe" />
            <Button type="submit">Créer l'équipe</Button>
          </form>
          <p className="text-sm text-muted-foreground">
            {teams?.length ? teams.map((team) => `${team.name} (${team.code})`).join(" · ") : "Aucune équipe créée."}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Liste des Employés</CardTitle>
          <CardDescription>Modifiez les rôles (EMPLOYEE, MANAGER, DRH) et l'équipe assignée.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users?.map((u) => (
              <form key={u.id} action={updateUserRoleAndTeam} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border rounded-lg bg-white gap-4">
                <input type="hidden" name="userId" value={u.id} />
                <div>
                  <h3 className="font-bold">{u.full_name}</h3>
                  <p className="text-sm text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-col">
                    <label className="text-xs text-muted-foreground">Date d'entrée</label>
                    <Input type="date" name="hireDate" defaultValue={u.hire_date} required className="h-9" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-muted-foreground">Rôle</label>
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="EMPLOYEE">Employé</option>
                      <option value="MANAGER">Manager</option>
                      <option value="DRH">DRH</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-muted-foreground">Équipe</label>
                    <select
                      name="teamId"
                      defaultValue={u.team_id || ""}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Aucune équipe</option>
                      {teams?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" size="sm" className="mt-4">Enregistrer</Button>
                </div>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calendrier des jours fériés tunisiens</CardTitle>
          <CardDescription>Ajoutez les fêtes mobiles dès leur annonce officielle. Elles seront exclues du calcul des jours ouvrés.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={addPublicHoliday} className="flex flex-col sm:flex-row gap-3">
            <Input type="date" name="holidayDate" required aria-label="Date du jour férié" />
            <Input name="name" maxLength={100} required placeholder="Nom du jour férié" aria-label="Nom du jour férié" />
            <Button type="submit">Ajouter</Button>
          </form>
          <div className="divide-y">
            {holidays?.map((holiday) => (
              <div key={holiday.holiday_date} className="flex items-center justify-between py-2 text-sm">
                <span>{holiday.name} — {new Date(`${holiday.holiday_date}T00:00:00`).toLocaleDateString("fr-TN")}</span>
                <form action={removePublicHoliday}>
                  <input type="hidden" name="holidayDate" value={holiday.holiday_date} />
                  <Button type="submit" variant="destructive" size="sm">Retirer</Button>
                </form>
              </div>
            ))}
            {!holidays?.length && <p className="py-2 text-sm text-muted-foreground">Aucun jour férié mobile configuré.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
