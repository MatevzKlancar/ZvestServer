import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.SUPABASE_URL || 'https://wjmldejbfyyuilqsemsr.supabase.co';
const supabaseKey =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbWxkZWpiZnl5dWlscXNlbXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU1NDMyMzcsImV4cCI6MjA0MTExOTIzN30.X1PIenrSvd9UStFnpxLgI_e-Mhgo4GJUmnwN9sVe9sA';
export const supabase = createClient(supabaseUrl, supabaseKey);
