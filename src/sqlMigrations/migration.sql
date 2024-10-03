-- I forgot to do this before, so some tables are missing
-- Create businesses table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create loyalty_points table
CREATE TABLE loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_id UUID NOT NULL,
  points INTEGER NOT NULL,
  awarded_by UUID NOT NULL,
  awarded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES all_users(user_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (awarded_by) REFERENCES all_users(user_id)
);

-- Create indexes for faster queries
CREATE INDEX idx_loyalty_points_user_id ON loyalty_points(user_id);
CREATE INDEX idx_loyalty_points_business_id ON loyalty_points(business_id);

-- Add business_id column to all_users table
ALTER TABLE all_users ADD COLUMN business_id UUID;
ALTER TABLE all_users ADD CONSTRAINT fk_all_users_business FOREIGN KEY (business_id) REFERENCES businesses(id);

-- Create qr_codes table
CREATE TABLE qr_codes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  qr_data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_qr_codes_user_id ON qr_codes(user_id);
CREATE INDEX idx_qr_codes_expires_at ON qr_codes(expires_at);