import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { env } from "../config/env.js";

export class ApiError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | ApiError | ZodError, req: FastifyRequest, reply: FastifyReply) => {
    const requestId = (req as any).requestId ?? "req_unknown";

    let statusCode = 500;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred";

    if (err instanceof ApiError) {
      statusCode = err.statusCode;
      code = err.code;
      message = err.message;
    } else if (err instanceof ZodError) {
      statusCode = 400;
      code = "INVALID_REQUEST";
      message = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    } else if ("validation" in err && err.validation) {
      statusCode = 400;
      code = "INVALID_REQUEST";
      message = (err as FastifyError).message;
    } else if ((err as FastifyError).statusCode) {

      statusCode = (err as FastifyError).statusCode!;
      code = statusCode === 429 ? "RATE_LIMITED" : "REQUEST_ERROR";
      message = err.message;
    }

    if (statusCode >= 500) {
      req.log.error({ err, requestId }, "unhandled_error");
      // Never expose stack traces or internals in production
      if (env.NODE_ENV === "production") {
        message = "An unexpected error occurred";
      }
    }

    reply.status(statusCode).send({
      error: { code, message, request_id: requestId },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    const requestId = (req as any).requestId ?? "req_unknown";
    reply.status(404).send({
      error: { code: "NOT_FOUND", message: "Resource not found", request_id: requestId },
    });
  });
}
