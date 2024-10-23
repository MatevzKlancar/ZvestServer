import { Context } from 'hono';
import { StatusCode } from 'hono/utils/http-status';
import CustomError from './customError';

export const errorHandler = (err: Error, c: Context) => {
  console.error(err);

  if (err instanceof CustomError) {
    return c.json(
      {
        status: 'error',
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      },
      err.statusCode as StatusCode
    );
  }

  // For unhandled errors, return a generic message
  return c.json(
    {
      status: 'error',
      message: 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
    500
  );
};
