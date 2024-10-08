import { Context, Next } from 'hono';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://wjmldejbfyyuilqsemsr.supabase.co';
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

export async function authMiddleware(c: Context, next: Next) {
  console.log('Auth middleware called');
  const authHeader = c.req.header('Authorization');
  console.log('Auth header:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Missing or invalid Authorization header');
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.split(' ')[1];
  console.log('Token:', token);

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
      {
        issuer: `${SUPABASE_URL}/auth/v1`,
      }
    );

    console.log('Token verified successfully');
    console.log('Payload:', payload);

    c.set('user', payload);
    await next();
  } catch (error) {
    console.error('Token verification failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return c.json({ error: 'Invalid token' }, 401);
  }
}
