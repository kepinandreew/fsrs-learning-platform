import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Meneruskan error dari handler async ke error middleware (Express 4). */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
