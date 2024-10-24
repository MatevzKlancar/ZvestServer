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
    const { email, password } = await c.req.json();

    if (!email || !password) {
      throw new CustomError('Email and password are required', 400);
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

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
    const body = await c.req.json();
    let data, error;

    if ('access_token' in body) {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) {
        throw new CustomError(sessionError.message, 401);
      }
      data = sessionData;
    } else if ('email' in body && 'password' in body) {
      const { email, password } = body;
      ({ data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      }));
    } else {
      throw new CustomError('Invalid login credentials', 400);
    }

    if (error) {
      throw new CustomError(error.message, 400);
    }

    if (!data.session || !data.session.user) {
      throw new CustomError('No session or user data found', 400);
    }

    // Fetch user role from all_users table
    const { data: userData, error: userError } = await supabase
      .from('all_users')
      .select('role')
      .eq('user_id', data.session.user.id)
      .single();

    if (userError) {
      throw new CustomError('Error fetching user role', 500);
    }

    // Create an extended session object
    const extendedSession: ExtendedSession = {
      ...data.session,
      user_role: userData.role,
    };

    return sendSuccessResponse(
      c,
      { session: extendedSession },
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
    const token = c.req.query('token_hash') || '';
    const type = c.req.query('type') || '';

    if (!token || !['signup', 'invite'].includes(type)) {
      return c.text('Invalid confirmation link', 400);
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: type === 'invite' ? 'invite' : 'signup',
    });

    if (error) {
      return c.json({ error: 'Invalid or expired token' }, 400);
    }

    if (data.user && data.user.id) {
      const role = type === 'invite' ? 'Staff' : 'Client';
      const email = data.user.email;
      const business_id =
        role === 'Staff' ? data.user.user_metadata?.business_id : null;

      const userData = {
        user_id: data.user.id,
        email,
        role,
        business_id,
      };

      const { error: insertError } = await supabase
        .from('all_users')
        .insert(userData);

      if (insertError) {
        console.error('Error inserting user data:', insertError);
      }
    }

    const loginUrl = `${process.env.FRONTEND_URL}/login?session=${encodeURIComponent(
      JSON.stringify(data.session)
    )}`;

    return c.redirect(loginUrl);
  } catch (error) {
    console.error('Error in confirmSignUp:', error);
    return c.text('An error occurred during confirmation', 500);
  }
};
