import { Router } from 'express';
import multer from 'multer';
import * as controller from './storage.controller';
import { authenticate } from '../../middleware/auth';
import { maxUploadBytes } from '../../integrations/storage';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes } });

export const storageRouter = Router();

// Upload a file (multipart, field "file"). Returns a storage path + signed URL.
storageRouter.post('/upload', authenticate, upload.single('file'), controller.upload);

// Token-gated download (the signed token is the authorization).
storageRouter.get('/download/:token', controller.download);

// Authorized signed URL for a request's resume (participant only).
storageRouter.get('/resume-url', authenticate, controller.resumeUrl);
