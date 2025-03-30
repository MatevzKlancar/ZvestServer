import { Context } from 'hono';
import { supabase } from '../config/supabase';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';
import { supabaseAdmin } from '../config/supabaseAdmin';

// Government invoice API interfaces
interface InvoiceIdentifier {
  BusinessPremiseID: string;
  ElectronicDeviceID: string;
  InvoiceNumber: string;
}

interface InvoiceData {
  TaxNumber: number;
  UniqueInvoiceID: string;
  ProtectedID: string;
  IssueDateTime: string;
  IssuerName: string;
  IssuerAddress: string;
  InvoiceAmount: number;
  PaymentAmount: number;
  InvoiceIdentifier: InvoiceIdentifier;
}

interface InvoiceResponse {
  Data: InvoiceData;
  status: {
    code: string;
    msg: string;
  };
}

interface Business {
  id: string;
  name: string;
  loyalty_type: string;
  image_url?: string;
  background_image_url?: string;
  info_image_urls?: string[];
}

interface RegularPointsData {
  business_id: string;
  total_points: number;
  businesses: Business;
}

interface CouponPointsData {
  business_id: string;
  businesses: Business;
}

interface Coupon {
  id: string;
  name: string;
  description: string;
  points_required: number;
  image_url?: string;
  sticker_image_url?: string;
  coupon_specific_points: Array<{
    points: number;
    last_updated: string;
  }>;
}

interface BusinessSummary {
  id: string;
  name: string;
  loyalty_type: string;
  total_points: number;
  has_regular_points: boolean;
  has_coupon_points: boolean;
  images: {
    imageUrl?: string;
    backgroundImageUrl?: string;
    infoImageUrls?: string[];
  };
}

interface BusinessCouponSummary {
  businessId: string;
  businessName: string;
  coupons: Array<{
    id: string;
    name: string;
    description: string;
    points_required: number;
    current_points: number;
    last_updated: string;
    images: {
      imageUrl?: string;
      stickerImageUrl?: string;
    };
  }>;
}

/**
 * Verifies an invoice with the government API using either a ZOI or QR code
 * @param apiKey API key for the government service
 * @param zoi ZOI (Protected ID) of the invoice
 * @param qr QR code data from the invoice
 * @returns Invoice data if verified, null if not found or invalid
 */
const verifyInvoiceWithGovernmentAPI = async (
  apiKey: string,
  zoi?: string,
  qr?: string
): Promise<InvoiceData | null> => {
  try {
    console.log('🔄 Starting government API verification process');

    // Production URL for the government API
    const baseUrl = 'https://blagajne.fu.gov.si:9007/v1/getInvoice';
    console.log('🌐 API endpoint:', baseUrl);

    // Build query string based on what's provided (either ZOI or QR)
    let queryParams = `apikey=${encodeURIComponent(apiKey)}`;
    if (zoi) {
      queryParams += `&zoi=${encodeURIComponent(zoi)}`;
      console.log(
        '🔑 Using ZOI for verification:',
        zoi.substring(0, 10) + '...'
      );
    } else if (qr) {
      queryParams += `&qr=${encodeURIComponent(qr)}`;
      console.log('🔑 Using QR code for verification (length):', qr.length);
    } else {
      console.error(
        '❌ Missing parameters: Either ZOI or QR code must be provided'
      );
      throw new Error('Either ZOI or QR code must be provided');
    }

    const url = `${baseUrl}?${queryParams}`;
    console.log('🔗 API request URL (masked):', url.replace(apiKey, '****'));

    console.log('📤 Sending request to government API...');

    // Temporarily disable SSL certificate verification
    // ⚠️ Note: This is not recommended for production, but needed for the government API
    console.log('⚠️ Temporarily disabling SSL verification for government API');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      console.log(
        '📥 Received response from government API, status:',
        response.status
      );

      if (!response.ok) {
        console.error(
          '❌ HTTP error from government API:',
          response.status,
          response.statusText
        );
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data: InvoiceResponse = await response.json();
      console.log(
        '📋 Government API response status:',
        data.status.code,
        data.status.msg
      );

      // Check the status code from the response
      if (data.status.code === '1') {
        // Invoice found
        console.log('✅ Invoice found in government database');
        console.log('📄 Invoice basic info:', {
          TaxNumber: data.Data.TaxNumber,
          InvoiceAmount: data.Data.InvoiceAmount,
          IssueDateTime: data.Data.IssueDateTime,
        });
        return data.Data;
      } else {
        // Invoice not found or other error
        console.error(
          '❌ Invoice verification failed. Status:',
          data.status.code,
          'Message:',
          data.status.msg
        );
        return null;
      }
    } finally {
      // Re-enable SSL certificate verification
      console.log('🔒 Re-enabling SSL verification');
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    }
  } catch (error) {
    console.error('❌ Error during government API verification:', error);
    // Make sure to re-enable SSL verification even if there's an error
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    return null;
  }
};

export const awardLoyaltyPoints = async (c: Context) => {
  const authUser = c.get('user');
  const { qrCodeData, amount } = await c.req.json();

  if (!authUser || !authUser.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const staffUserId = authUser.id;

  // Check if the user is a staff member and get business info
  const { data: userData, error: fetchUserError } =
    await supabaseAdmin.auth.admin.getUserById(staffUserId);

  if (fetchUserError || !userData || !userData.user) {
    return c.json({ error: 'Error fetching user data' }, 500);
  }

  const staffUser = userData.user;

  const staffData = {
    user_id: staffUser.id,
    business_id: staffUser.user_metadata?.business_id,
    role: staffUser.user_metadata?.role,
  };

  if (!['Staff', 'Owner'].includes(staffData.role)) {
    return c.json(
      {
        error: 'Access denied. Only staff members and owners can award points.',
      },
      403
    );
  }

  if (!qrCodeData || !amount || isNaN(amount) || amount <= 0) {
    return c.json(
      { error: 'Invalid input. Please provide valid QR code data and amount.' },
      400
    );
  }

  // Extract the UUID part from the qrCodeData
  const userId = qrCodeData.split('-').slice(0, 5).join('-');

  // Verify if the user exists
  const { data: customerData, error: customerError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (customerError || !customerData || !customerData.user) {
    console.error('Error fetching user data:', customerError);
    return c.json({ error: 'Invalid or non-existent user.' }, 400);
  }

  // Start a Supabase transaction
  const { data, error } = await supabase.rpc('award_loyalty_points', {
    p_user_id: userId,
    p_business_id: staffData.business_id,
    p_points: amount,
    p_awarded_by: staffData.user_id,
  });

  if (error) {
    console.error('Error awarding loyalty points:', error);
    return c.json({ error: 'Error awarding loyalty points' }, 500);
  }

  // Log the staff action
  await supabase.from('staff_actions').insert({
    staff_user_id: staffUserId,
    action_type: 'AWARD_POINTS',
    action_details: {
      points_awarded: amount,
      recipient_user_id: userId,
    },
    business_id: staffData.business_id,
  });

  return c.json({
    message: 'Loyalty points awarded successfully',
    awarded: amount,
    total_points: data.total_points,
  });
};

export const getLoyaltyPointsInfo = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    const staffUserId = authUser.id;

    // Check if the user is a staff member or owner and get business info
    const { data: userData, error: fetchUserError } =
      await supabaseAdmin.auth.admin.getUserById(staffUserId);

    if (fetchUserError || !userData || !userData.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const staffUser = userData.user;

    const staffData = {
      user_id: staffUser.id,
      business_id: staffUser.user_metadata?.business_id,
      role: staffUser.user_metadata?.role,
    };

    if (staffData.role !== 'Staff' && staffData.role !== 'Owner') {
      throw new CustomError(
        'Access denied. Only staff members or owners can view loyalty points information.',
        403
      );
    }

    // Get loyalty points information for the business
    const { data: loyaltyPointsData, error: loyaltyPointsError } =
      await supabase
        .from('loyalty_points')
        .select(
          `
          id,
          user_id,
          points,
          awarded_by,
          awarded_at
        `
        )
        .eq('business_id', staffData.business_id)
        .order('awarded_at', { ascending: false });

    if (loyaltyPointsError) {
      throw new CustomError('Error fetching loyalty points data', 500);
    }

    // Fetch user details for each loyalty point entry
    const loyaltyPointsWithUserDetails = await Promise.all(
      loyaltyPointsData.map(async (point) => {
        const { data: customerData } = await supabase.auth.admin.getUserById(
          point.user_id
        );
        const { data: staffData } = await supabase.auth.admin.getUserById(
          point.awarded_by
        );

        return {
          ...point,
          customer: customerData?.user
            ? {
                email: customerData.user.email,
                role: customerData.user.user_metadata?.role,
              }
            : null,
          staff: staffData?.user
            ? {
                email: staffData.user.email,
                role: staffData.user.user_metadata?.role,
              }
            : null,
        };
      })
    );

    return sendSuccessResponse(
      c,
      { data: loyaltyPointsWithUserDetails },
      'Loyalty points information retrieved successfully'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const getUserLoyaltyPoints = async (c: Context) => {
  const authUser = c.get('user');
  const businessId = c.req.query('business_id');

  if (!authUser || !authUser.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = authUser.id;

  let query = supabase
    .from('user_loyalty_points')
    .select('business_id, total_points, businesses(name)')
    .eq('user_id', userId);

  if (businessId) {
    // Validate the business_id format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(businessId)) {
      return c.json({ error: 'Invalid business ID format' }, 400);
    }
    query = query.eq('business_id', businessId);
  }

  const { data: userPoints, error } = await query;

  if (error) {
    console.error('Error fetching user loyalty points:', error);
    if (error.code === '22P02') {
      return c.json({ error: 'Invalid business ID format' }, 400);
    }
    return c.json({ error: 'Error fetching loyalty points' }, 500);
  }

  if (businessId && userPoints.length === 0) {
    return c.json(
      { error: 'No loyalty points found for the specified business' },
      404
    );
  }

  return c.json({
    message: 'User loyalty points retrieved successfully',
    data: userPoints,
    user_id: userId,
  });
};

export const getUserCouponSpecificPoints = async (c: Context) => {
  try {
    const authUser = c.get('user');
    const businessId = c.req.param('businessId');

    if (!authUser || !authUser.id) {
      return sendErrorResponse(c, 'Not authenticated', 401);
    }

    if (!businessId) {
      return sendErrorResponse(c, 'Business ID is required', 400);
    }

    // First get all active coupons for the business
    const { data: businessCoupons, error: couponsError } = await supabase
      .from('coupons')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true);

    if (couponsError) {
      console.error('Error fetching business coupons:', couponsError);
      return sendErrorResponse(c, 'Error fetching business coupons', 500);
    }

    // Then get all coupon-specific points for the user
    const { data: userPoints, error: pointsError } = await supabase
      .from('coupon_specific_points')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('business_id', businessId);

    if (pointsError) {
      console.error('Error fetching user points:', pointsError);
      return sendErrorResponse(c, 'Error fetching user points', 500);
    }

    // Combine the data
    const couponsWithPoints = businessCoupons.map((coupon) => {
      const pointsEntry = userPoints.find((p) => p.coupon_id === coupon.id);
      return {
        ...coupon,
        current_points: pointsEntry?.points || 0,
        last_updated: pointsEntry?.last_updated || null,
      };
    });

    return sendSuccessResponse(
      c,
      {
        coupons: couponsWithPoints,
      },
      'Coupon points retrieved successfully'
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const getUserLoyaltySummary = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      return sendErrorResponse(c, 'Not authenticated', 401);
    }

    // Get businesses with regular loyalty points
    const { data: regularPointsData, error: regularPointsError } =
      (await supabase
        .from('user_loyalty_points')
        .select(
          `
        business_id,
        total_points,
        businesses (
          id,
          name,
          loyalty_type,
          image_url,
          background_image_url,
          info_image_urls
        )
      `
        )
        .eq('user_id', authUser.id)) as {
        data: RegularPointsData[] | null;
        error: any;
      };

    if (regularPointsError) {
      console.error('Error fetching regular points:', regularPointsError);
      return sendErrorResponse(c, 'Error fetching loyalty points', 500);
    }

    // Get businesses with coupon-specific points
    const { data: rawCouponPointsData, error: couponPointsError } =
      (await supabase
        .from('coupon_specific_points')
        .select(
          `
        business_id,
        businesses (
          id,
          name,
          loyalty_type,
          image_url,
          background_image_url,
          info_image_urls
        )
      `
        )
        .eq('user_id', authUser.id)) as {
        data: CouponPointsData[] | null;
        error: any;
      };

    if (couponPointsError) {
      console.error('Error fetching coupon points:', couponPointsError);
      return sendErrorResponse(c, 'Error fetching coupon points', 500);
    }

    // Combine and deduplicate businesses
    const businessMap = new Map<string, BusinessSummary>();

    // Add businesses with regular points
    regularPointsData?.forEach((item) => {
      businessMap.set(item.business_id, {
        id: item.business_id,
        name: item.businesses.name,
        loyalty_type: item.businesses.loyalty_type,
        total_points: item.total_points,
        has_regular_points: true,
        has_coupon_points: false,
        images: {
          imageUrl: item.businesses.image_url,
          backgroundImageUrl: item.businesses.background_image_url,
          infoImageUrls: item.businesses.info_image_urls,
        },
      });
    });

    // Add businesses with coupon points
    rawCouponPointsData?.forEach((item) => {
      if (businessMap.has(item.business_id)) {
        const existing = businessMap.get(item.business_id)!;
        existing.has_coupon_points = true;
      } else {
        businessMap.set(item.business_id, {
          id: item.business_id,
          name: item.businesses.name,
          loyalty_type: item.businesses.loyalty_type,
          total_points: 0,
          has_regular_points: false,
          has_coupon_points: true,
          images: {
            imageUrl: item.businesses.image_url,
            backgroundImageUrl: item.businesses.background_image_url,
            infoImageUrls: item.businesses.info_image_urls,
          },
        });
      }
    });

    // Get coupon details for businesses with coupon points
    const businessesWithCoupons: BusinessCouponSummary[] = await Promise.all(
      Array.from(businessMap.values())
        .filter((business) => business.has_coupon_points)
        .map(async (business) => {
          const { data: coupons, error: couponsError } = (await supabase
            .from('coupons')
            .select(
              `
              id,
              name,
              description,
              points_required,
              image_url,
              sticker_image_url,
              is_active,
              coupon_specific_points!inner(points, last_updated)
            `
            )
            .eq('business_id', business.id)
            .eq('is_active', true)
            .eq('coupon_specific_points.user_id', authUser.id)) as {
            data: Coupon[] | null;
            error: any;
          };

          if (couponsError) {
            console.error('Error fetching coupons:', couponsError);
            return {
              businessId: business.id,
              businessName: business.name,
              coupons: [],
            };
          }

          return {
            businessId: business.id,
            businessName: business.name,
            coupons:
              coupons?.map((coupon) => ({
                id: coupon.id,
                name: coupon.name,
                description: coupon.description,
                points_required: coupon.points_required,
                current_points: coupon.coupon_specific_points[0]?.points || 0,
                last_updated: coupon.coupon_specific_points[0]?.last_updated,
                images: {
                  imageUrl: coupon.image_url,
                  stickerImageUrl: coupon.sticker_image_url,
                },
              })) || [],
          };
        })
    );

    return sendSuccessResponse(
      c,
      {
        businesses: Array.from(businessMap.values()),
        businessCoupons: businessesWithCoupons,
      },
      'User loyalty summary retrieved successfully'
    );
  } catch (error) {
    console.error('Error getting user loyalty summary:', error);
    return sendErrorResponse(c, 'Failed to get user loyalty summary', 500);
  }
};

export const claimLoyaltyPointsFromBill = async (c: Context) => {
  try {
    console.log('👉 Claim loyalty points process started');
    const authUser = c.get('user');
    const { qrCode } = await c.req.json();
    console.log('📝 Request data:', {
      userID: authUser?.id,
      qrCodeLength: qrCode?.length,
    });

    if (!authUser || !authUser.id) {
      console.log('❌ Authentication failed: No valid user found');
      return sendErrorResponse(c, 'Not authenticated', 401);
    }

    const userId = authUser.id;
    console.log('👤 User ID:', userId);

    // Validate input
    if (!qrCode) {
      console.log('❌ Validation failed: QR code data missing');
      return sendErrorResponse(c, 'QR code data is required', 400);
    }

    console.log(
      '📱 QR code data received (first 20 chars):',
      qrCode.substring(0, 20) + '...'
    );

    // The API key would be stored in an environment variable or config file
    const API_KEY = process.env.INVOICE_API_KEY;
    console.log('🔑 API key check:', API_KEY ? 'Available' : 'Missing');

    if (!API_KEY) {
      console.error('❌ Invoice API key not configured');
      return sendErrorResponse(c, 'System configuration error', 500);
    }

    // Verify the invoice with the government API
    console.log('🔍 Calling government invoice API...');
    console.log('🔗 Using QR code to verify invoice');
    const invoiceData = await verifyInvoiceWithGovernmentAPI(
      API_KEY,
      undefined,
      qrCode
    );

    if (!invoiceData) {
      console.log(
        '❌ Invoice verification failed: No data returned from government API'
      );
      return sendErrorResponse(
        c,
        'Invoice verification failed. Please check the QR code.',
        400
      );
    }

    console.log('✅ Invoice verification successful');
    console.log('📄 Invoice data:', {
      TaxNumber: invoiceData.TaxNumber,
      UniqueInvoiceID: invoiceData.UniqueInvoiceID,
      IssueDateTime: invoiceData.IssueDateTime,
      IssuerName: invoiceData.IssuerName,
      Amount: invoiceData.InvoiceAmount,
      InvoiceIdentifier: invoiceData.InvoiceIdentifier,
    });

    // Find business by tax number
    console.log(
      '🔍 Looking up business with tax number:',
      invoiceData.TaxNumber
    );
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('tax_number', invoiceData.TaxNumber.toString())
      .single();

    if (businessError) {
      console.error(
        '❌ Error looking up business by tax number:',
        businessError
      );
      return sendErrorResponse(c, 'Error finding business', 500);
    }

    if (!business) {
      console.error(
        '❌ Business not found for tax number:',
        invoiceData.TaxNumber
      );
      return sendErrorResponse(
        c,
        'This business is not registered in our system',
        404
      );
    }

    console.log('✅ Business found:', { id: business.id, name: business.name });

    // Check if this invoice has already been claimed
    console.log('🔍 Checking if invoice has already been claimed...');
    const { data: existingClaims, error: claimsError } = await supabase
      .from('loyalty_points')
      .select('id')
      .eq('user_id', userId)
      .eq('invoice_id', invoiceData.UniqueInvoiceID);

    if (claimsError) {
      console.error('❌ Error checking for existing claims:', claimsError);
      return sendErrorResponse(
        c,
        'Error checking if invoice was already claimed',
        500
      );
    }

    if (existingClaims && existingClaims.length > 0) {
      console.log('❌ Invoice already claimed:', existingClaims);
      return sendErrorResponse(c, 'This invoice has already been claimed', 400);
    }

    console.log('✅ Invoice has not been claimed yet');

    // Calculate points based on the invoice amount
    const pointsToAward = Math.floor(invoiceData.InvoiceAmount);
    console.log(
      '🎯 Points to award:',
      pointsToAward,
      'based on amount:',
      invoiceData.InvoiceAmount
    );

    // Award the loyalty points
    console.log('💰 Awarding loyalty points...');
    const { data, error } = await supabase.rpc('award_loyalty_points', {
      p_user_id: userId,
      p_business_id: business.id,
      p_points: pointsToAward,
      p_awarded_by: null, // No staff member involved
    });

    if (error) {
      console.error('❌ Error awarding loyalty points:', error);
      return sendErrorResponse(c, 'Error awarding loyalty points', 500);
    }

    console.log('✅ Loyalty points awarded successfully:', {
      awarded: pointsToAward,
      total_points: data.total_points,
    });

    // Record the invoice details with the loyalty points
    console.log('📝 Recording invoice details...');
    const invoiceDetails = {
      taxNumber: invoiceData.TaxNumber,
      protectedId: invoiceData.ProtectedID,
      issueDateTime: invoiceData.IssueDateTime,
      issuerName: invoiceData.IssuerName,
      invoiceAmount: invoiceData.InvoiceAmount,
      invoiceNumber: `${invoiceData.InvoiceIdentifier.BusinessPremiseID}-${invoiceData.InvoiceIdentifier.ElectronicDeviceID}-${invoiceData.InvoiceIdentifier.InvoiceNumber}`,
    };
    console.log('📄 Invoice details:', invoiceDetails);

    const { error: updateError } = await supabase
      .from('loyalty_points')
      .update({
        invoice_id: invoiceData.UniqueInvoiceID,
        invoice_details: invoiceDetails,
      })
      .eq('user_id', userId)
      .eq('business_id', business.id)
      .is('invoice_id', null);

    if (updateError) {
      console.error('⚠️ Warning: Error updating invoice details:', updateError);
      // We continue anyway since points were already awarded
    } else {
      console.log('✅ Invoice details recorded successfully');
    }

    console.log('🎉 Claim process completed successfully');
    return sendSuccessResponse(
      c,
      {
        awarded: pointsToAward,
        total_points: data.total_points,
        business: {
          id: business.id,
          name: business.name,
        },
        invoice: {
          issuer: invoiceData.IssuerName,
          amount: invoiceData.InvoiceAmount,
          date: invoiceData.IssueDateTime,
          invoiceNumber: `${invoiceData.InvoiceIdentifier.BusinessPremiseID}-${invoiceData.InvoiceIdentifier.ElectronicDeviceID}-${invoiceData.InvoiceIdentifier.InvoiceNumber}`,
        },
      },
      'Loyalty points claimed successfully'
    );
  } catch (error) {
    console.error('❌❌❌ Unexpected error claiming loyalty points:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};
