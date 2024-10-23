import { Context } from 'hono';
import { StatusCode } from 'hono/utils/http-status';
export const sendSuccessResponse = (
  c: Context,
  data: any,
  message = 'Success',
  statusCode = 200
) => {
  return c.json(
    {
      status: 'success',
      message,
      data,
    },
    statusCode as StatusCode
  );
};

export const sendErrorResponse = (
  c: Context,
  message: string,
  statusCode = 400
) => {
  return c.json(
    {
      status: 'error',
      message,
    },
    statusCode as StatusCode
  );
};
