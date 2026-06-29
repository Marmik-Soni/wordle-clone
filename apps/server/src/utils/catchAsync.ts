import type { Request, Response, NextFunction } from "express";

/**
 * Wraps an async route handler and forwards any thrown errors to Express's
 * next() error pipeline. Generic over TReq so that AuthRequest-typed handlers
 * (which extend Request) can be passed without TypeScript complaining.
 */
export function catchAsync<TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: TReq, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
