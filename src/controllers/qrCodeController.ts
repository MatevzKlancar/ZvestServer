import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { generateQRCode } from '../utils/qrCodeGenerator';


export const getQRCode = async (c: Context) => {

  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = session.user.id;
  

  const uniqueIdentifier = `${userId}-${Date.now()}`;
  

  const qrCodeData = await generateQRCode(uniqueIdentifier);
  
  // Extract the base64 data from the data URL
  const base64Data = qrCodeData.split(',')[1];

  return c.json({
    qrCode: {
      data: base64Data,
      format: 'png',
      encoding: 'base64'
    }
  });
};