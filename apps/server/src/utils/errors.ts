export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", code = "BAD_REQUEST") {
    super(message, 400, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code = "FORBIDDEN") {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code = "NOT_FOUND") {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", code = "CONFLICT") {
    super(message, 409, code);
  }
}

export class GoneError extends AppError {
  constructor(message = "Resource no longer available", code = "GONE") {
    super(message, 410, code);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = "Unprocessable entity", code = "UNPROCESSABLE_ENTITY") {
    super(message, 422, code);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", code = "TOO_MANY_REQUESTS") {
    super(message, 429, code);
  }
}

export class BadGatewayError extends AppError {
  constructor(message = "Upstream service error", code = "BAD_GATEWAY") {
    super(message, 502, code);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable", code = "SERVICE_UNAVAILABLE") {
    super(message, 503, code);
  }
}
