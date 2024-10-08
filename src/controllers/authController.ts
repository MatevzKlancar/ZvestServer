import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { Session } from '@supabase/supabase-js';

// Extend the Session type to include user_role
interface ExtendedSession extends Session {
  user_role?: string;
}

export const signUp = async (c: Context) => {
  try {
    const { email, password } = await c.req.json();

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    return c.json({
      message: 'Please check your email to confirm your account.',
    });
  } catch (error) {
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const login = async (c: Context) => {
  try {
    const body = await c.req.json();
    let data, error;

    if ('access_token' in body) {
      // Login with access token
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) {
        return c.json({ error: sessionError.message }, 401);
      }
      data = sessionData;
      error = null;
    } else if ('email' in body && 'password' in body) {
      // Login with email and password
      const { email, password } = body;
      ({ data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      }));
    } else {
      return c.json({ error: 'Invalid login credentials' }, 400);
    }

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    if (!data.session || !data.session.user) {
      return c.json({ error: 'No session or user data found' }, 400);
    }

    // Fetch user role from all_users table
    const { data: userData, error: userError } = await supabase
      .from('all_users')
      .select('role')
      .eq('user_id', data.session.user.id)
      .single();

    if (userError) {
      return c.json({ error: 'Error fetching user role' }, 500);
    }

    // Create an extended session object
    const extendedSession: ExtendedSession = {
      ...data.session,
      user_role: userData.role,
    };

    return c.json({
      session: extendedSession,
    });
  } catch (error) {
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const confirmSignUp = async (c: Context) => {
  try {
    const token = c.req.query('token_hash');
    const type = c.req.query('type');

    if (type !== 'signup' || !token) {
      return c.text('Invalid confirmation link', 400);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const frontendUrl = process.env.FRONTEND_URL; // Add this to your environment variables
    if (!supabaseUrl || !frontendUrl) {
      console.error(
        'SUPABASE_URL or FRONTEND_URL is not set in the environment variables'
      );
      return c.text('Server configuration error', 500);
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'signup',
    });

    if (error) {
      return c.json({ error: 'Invalid or expired token' }, 400);
    }

    if (data.user && data.user.id) {
      const { error: insertError } = await supabase.from('all_users').insert({
        user_id: data.user.id,
        email: data.user.email,
        role: 'Owner',
      });

      if (insertError) {
        console.error(
          'Error inserting user data into users table:',
          insertError
        );
      } else {
        console.log('User data inserted successfully into users table');
      }
    }

    // Generate a login URL with the session token
    const loginUrl = `${frontendUrl}/login?session=${encodeURIComponent(JSON.stringify(data.session))}`;

    // Redirect to the frontend login page with the session data
    return c.redirect(loginUrl);
  } catch (error) {
    console.error('Error during confirmation:', error);
    return c.text(
      'An error occurred during confirmation. Please try again.',
      500
    );
  }
};
