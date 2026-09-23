import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import { sendCreated, sendError, sendSuccess } from '../src/utils/apiResponse';
import { AppError } from '../src/utils/AppError';

function mockRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

describe('apiResponse envelope', () => {
  it('sendSuccess wraps data with success:true and status', () => {
    const res = mockRes();
    sendSuccess(res, { x: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { x: 1 }, status: 200 });
  });

  it('sendCreated uses 201', () => {
    const res = mockRes();
    sendCreated(res, { id: 'a' }, 'made');
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('made');
  });

  it('sendError wraps an error with success:false', () => {
    const res = mockRes();
    sendError(res, 'nope', 400);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'nope', status: 400 });
  });
});

describe('AppError', () => {
  it('factories carry the right status + code', () => {
    expect(AppError.notFound().statusCode).toBe(404);
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.conflict().statusCode).toBe(409);
    expect(AppError.badRequest().code).toBe('bad_request');
  });

  it('operational vs non-operational', () => {
    expect(AppError.notFound().isOperational).toBe(true);
    expect(AppError.internal().isOperational).toBe(false);
  });
});
