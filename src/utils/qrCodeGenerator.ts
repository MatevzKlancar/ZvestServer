import QRCode from 'qrcode';

export async function generateQRCode(data: string): Promise<string> {
  try {
    // Generate QR code as a data URL
    const qrCodeDataUrl = await QRCode.toDataURL(data);
    return qrCodeDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}
