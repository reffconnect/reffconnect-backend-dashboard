import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { authenticate } from '../../middleware/auth';
import { chatJson } from '../../integrations/openai';
import { getActiveConsent } from '../trust/trust.service';

const parseResumeSchema = z.object({
  rawText: z.string().trim().min(30, 'Provide the resume text to parse').max(50_000),
  userType: z.enum(['job_seeker', 'working_professional']).default('job_seeker'),
});

const SYSTEM_PROMPT = `You are a precise resume parser. Extract structured profile data from the resume text.
Respond ONLY with a JSON object with keys: fullName, email, phone, headline, currentCompany,
skills (string array), education (array), workHistory (array), projects (array), certifications (array),
achievements (array). Use null or [] when a field is absent. Do not invent data.`;

export const aiRouter = Router();

// AI resume parsing (OpenAI). Requires OPENAI_API_KEY, else 503.
aiRouter.post(
  '/parse-resume',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const { rawText, userType } = parseResumeSchema.parse(req.body);

    // Authorize before sending the resume to a third-party model: the user must
    // hold an active `ai_processing` consent grant. Checked regardless of
    // whether OpenAI is configured, so consent is a hard precondition.
    if (!(await getActiveConsent(req.user.id, 'ai_processing'))) {
      throw AppError.forbidden(
        'Grant AI-processing consent before using resume parsing',
      );
    }

    const data = await chatJson<Record<string, unknown>>(
      SYSTEM_PROMPT,
      `User type: ${userType}\n\nResume:\n${rawText}`,
    );
    const fieldsExtracted = Object.values(data).filter(
      (v) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0),
    ).length;
    sendSuccess(res, { data, fieldsExtracted });
  }),
);
