-- Add invoice details to loyalty_points table
ALTER TABLE loyalty_points ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(255);
ALTER TABLE loyalty_points ADD COLUMN IF NOT EXISTS invoice_details JSONB;

-- Make awarded_by field nullable to allow for customer-initiated claims
ALTER TABLE loyalty_points ALTER COLUMN awarded_by DROP NOT NULL;

-- Create an index on invoice_id for faster queries
CREATE INDEX IF NOT EXISTS idx_loyalty_points_invoice_id ON loyalty_points(invoice_id);

-- Add tax number to businesses table for matching with government API data
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tax_number VARCHAR(20); 