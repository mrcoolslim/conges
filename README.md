# Gestion des congés

Application Next.js pour les demandes de congés d'une entreprise, avec authentification Supabase, équipes, approbation par manager et administration DRH.

## Configuration

1. Créez un projet Supabase et renseignez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans `.env.local` (la clé doit être une clé publique/publishable, jamais une clé `service_role`).
2. Pour une base neuve, exécutez le SQL de `supabase/migrations/20261019000000_schema_and_rls.sql` dans l'éditeur SQL Supabase.
3. Créez les équipes, puis attribuez les rôles et équipes aux profils depuis l'espace DRH. Les comptes inscrits commencent avec le rôle Employé.
4. Créez au moins un compte DRH par une opération d'administration contrôlée avant d'ouvrir les inscriptions.
5. Lancez le projet avec `npm run dev`.

## Règles de congé intégrées

- Congé annuel : 30 jours par an, acquis au rythme de 2,5 jours pour chaque mois civil terminé depuis la date d'entrée. Le DRH renseigne la date d'entrée dans la fiche de chaque employé; le tableau de bord retire les congés annuels approuvés de l'année en cours.
- Types disponibles : Congé annuel, Congé de maladie, Congé de maternité, Récupération et Autorisation spéciale.
- Le calcul par défaut compte les jours du lundi au vendredi et exclut les jours fériés fixes configurés pour la Tunisie.
- Les jours fériés mobiles (Aïd el-Fitr, Aïd el-Adha, Ras el-Am el-Hijri et Mouled) sont ajoutés par le DRH dès que leurs dates officielles sont annoncées, dans « Calendrier des jours fériés tunisiens ».

Le calendrier hebdomadaire est réglé par défaut du lundi au vendredi. Si l'entreprise a un autre jour de repos hebdomadaire, la règle devra être adaptée avant le déploiement. Les jours de repos et jours fériés applicables aux entreprises privées peuvent dépendre de l'activité et des accords en vigueur.

## Vérification

`npx tsc --noEmit` vérifie les types. `npm run build` compile l'application. L'interface utilise des polices système et ne dépend pas d'un accès à Google Fonts.
