import { Context, Next } from 'hono';
import { supabase } from '../config/supabase';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    c.set('user', {
      id: user.id,
      email: user.email,
      role: user.user_metadata.role,
      name: user.user_metadata.name,
      surname: user.user_metadata.surname,
      date_of_birth: user.user_metadata.date_of_birth,
      business_id: user.user_metadata.business_id,
    });

    await next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return c.json({ error: 'Invalid token' }, 401);
  }
}
