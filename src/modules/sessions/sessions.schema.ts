import { z } from 'zod';

export const scheduleSessionSchema = z
  .object({
    request_id: z.number().int().positive().nullable().optional(),
    requester_id: z.string().uuid(),
    referrer_id: z.string().uuid(),
    referrer_name: z.string().max(200).nullable().optional(),
    referrer_company: z.string().max(200).nullable().optional(),
    scheduled_start: z.string().datetime(),
    scheduled_end: z.string().datetime(),
    duration_minutes: z.number().int().positive().max(240),
  })
  .refine((d) => new Date(d.scheduled_end) > new Date(d.scheduled_start), {
    message: 'scheduled_end must be after scheduled_start',
    path: ['scheduled_end'],
  });
export type ScheduleSessionInput = z.infer<typeof scheduleSessionSchema>;

export const rescheduleSessionSchema = z
  .object({
    scheduled_start: z.string().datetime(),
    scheduled_end: z.string().datetime(),
    duration_minutes: z.number().int().positive().max(240).optional(),
  })
  .refine((d) => new Date(d.scheduled_end) > new Date(d.scheduled_start), {
    message: 'scheduled_end must be after scheduled_start',
    path: ['scheduled_end'],
  });
export type RescheduleSessionInput = z.infer<typeof rescheduleSessionSchema>;

export const cancelSessionSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const referrerIdParamSchema = z.object({ referrerId: z.string().uuid() });
