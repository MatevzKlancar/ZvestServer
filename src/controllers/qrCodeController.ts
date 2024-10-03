import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { generateQRCode } from '../utils/qrCodeGenerator';

export const getQRCode = async (c: Context) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = session.user.id;

  // Check for existing active QR code
  const { data: existingQRCode, error: fetchError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    return c.json({ error: 'Error fetching QR code' }, 500);
  }

  let qrCode;

  if (existingQRCode) {
    qrCode = existingQRCode;
  } else {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000); // 5 minutes from now

    const uniqueIdentifier = `${userId}-${createdAt.getTime()}`;
    const qrCodeData = await generateQRCode(uniqueIdentifier);
    const base64Data = qrCodeData.split(',')[1];

    const { data: newQRCode, error: insertError } = await supabase
      .from('qr_codes')
      .insert({
        user_id: userId,
        qr_data: base64Data,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return c.json({ error: 'Error creating QR code' }, 500);
    }

    qrCode = newQRCode;
  }

  return c.json({
    qrCode: {
      id: qrCode.id,
      data: qrCode.qr_data,
      format: 'png',
      encoding: 'base64',
      createdAt: qrCode.created_at,
      expiresAt: qrCode.expires_at,
    },
  });
};
