import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const VALID = /^[A-Za-z0-9._-]{8,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming && VALID.test(incoming) ? incoming : randomUUID();
  res.locals['requestId'] = id;
  res.setHeader('X-Request-Id', id);
  next();
};
