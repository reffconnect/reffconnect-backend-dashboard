import type { AuthUserContext } from './index';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by the auth guard once a valid access token is verified. */
      user?: AuthUserContext;
      /** Raw request body bytes, captured by the JSON parser for webhook HMAC checks. */
      rawBody?: Buffer;
    }
  }
}

export {};
