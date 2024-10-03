import { Context } from 'hono';
import { supabase } from '../config/supabase';

export const signUp = async (c: Context) => {
  try {
    console.log('Starting sign-up process');
    const { email, password } = await c.req.json();
    console.log(`Attempting to sign up user with email: ${email}`);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      console.error('Supabase auth.signUp error:', error);
      return c.json({ error: error.message }, 400);
    }

    console.log('User signed up successfully in auth. User ID:', data.user?.id);
    return c.json({
      message: 'Please check your email to confirm your account.',
    });
  } catch (error) {
    console.error('Unexpected error in signUp function:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const login = async (c: Context) => {
  const { email, password } = await c.req.json();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  return c.json({ session: data.session });
};

export const confirmSignUp = async (c: Context) => {
  const token_hash = c.req.query('token_hash');
  const type = c.req.query('type');

  if (type !== 'signup' || !token_hash) {
    return c.text('Invalid confirmation link', 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('SUPABASE_URL is not set in the environment variables');
    return c.text('Server configuration error', 500);
  }

  const confirmationUrl = `${supabaseUrl}/auth/v1/verify`;

  try {
    console.log('Attempting to confirm user with URL:', confirmationUrl);

    const response = await fetch(confirmationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        type: 'signup',
        token_hash: token_hash,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'Confirmation failed. Status:',
        response.status,
        'Error:',
        errorText
      );
      throw new Error(`Failed to confirm user. Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Confirmation response:', data);

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

    return c.redirect('/auth/signup-success');
  } catch (error) {
    console.error('Error during confirmation:', error);
    return c.text(
      'An error occurred during confirmation. Please try again.',
      500
    );
  }
};
