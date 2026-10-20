import * as z from "zod";

export const LeaveRequestSchema = z.object({
  leave_type_id: z.string().uuid({ message: "Veuillez sélectionner un type de congé." }),
  start_date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Date de début invalide.",
  }),
  end_date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Date de fin invalide.",
  }),
  half_day: z.enum(['NONE', 'MORNING', 'AFTERNOON']).default('NONE'),
  reason: z.string().min(5, { message: "Le motif doit contenir au moins 5 caractères." }).optional(),
}).refine((data) => new Date(data.end_date) >= new Date(data.start_date), {
  message: "La date de fin doit être postérieure ou égale à la date de début.",
  path: ["end_date"],
});

export type LeaveRequestFormValues = z.infer<typeof LeaveRequestSchema>;
