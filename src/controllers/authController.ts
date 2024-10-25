import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { Session } from '@supabase/supabase-js';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';

// Extend the Session type to include user_role
interface ExtendedSession extends Session {
  user_role?: string;
}

export const signUp = async (c: Context) => {
  try {
    const { email, password, name, surname, date_of_birth } =
      await c.req.json();

    if (!email || !password) {
      throw new CustomError('Email and password are required', 400);
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'Client', // Default role
          name,
          surname,
          date_of_birth,
        },
      },
    });

    if (error) {
      throw new CustomError(error.message, 400);
    }

    return sendSuccessResponse(
      c,
      data,
      'Please check your email to confirm your account.',
      201
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const login = async (c: Context) => {
  try {
    const { email, password } = await c.req.json();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new CustomError(error.message, 400);
    }

    if (!data.user) {
      throw new CustomError('No user data found', 400);
    }

    const userMetadata = data.user.user_metadata;

    return sendSuccessResponse(
      c,
      {
        session: data.session,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: userMetadata.role,
          name: userMetadata.name,
          surname: userMetadata.surname,
          date_of_birth: userMetadata.date_of_birth,
          business_id: userMetadata.business_id,
        },
      },
      'Login successful'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const confirmSignUp = async (c: Context) => {
  try {
    const { token_hash, type, name, surname, date_of_birth } =
      await c.req.json();

    if (!token_hash || !['signup', 'invite'].includes(type)) {
      throw new CustomError('Invalid confirmation data', 400);
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type === 'invite' ? 'invite' : 'signup',
    });

    if (error) {
      throw new CustomError('Invalid or expired token', 400);
    }

    if (data.user && data.user.id) {
      const role = type === 'invite' ? 'Staff' : 'Client';
      const email = data.user.email;
      const business_id =
        type === 'invite' ? data.user.user_metadata?.business_id : null;

      // Update user metadata
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        data.user.id,
        {
          user_metadata: {
            ...data.user.user_metadata,
            role,
            name,
            surname,
            date_of_birth,
            business_id,
          },
        }
      );

      if (updateError) {
        throw new CustomError('Error updating user data', 500);
      }
    }

    const loginUrl = `${process.env.FRONTEND_URL}/login?session=${encodeURIComponent(
      JSON.stringify(data.session)
    )}`;

    return sendSuccessResponse(
      c,
      { redirectUrl: loginUrl },
      'Signup confirmed successfully'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(
      c,
      'An unexpected error occurred during confirmation',
      500
    );
  }
};
