-- Part A: Add financial_status column to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS financial_status text DEFAULT 'paid';

CREATE INDEX IF NOT EXISTS idx_orders_financial_status 
ON public.orders (financial_status);

COMMENT ON COLUMN public.orders.financial_status IS 
'Shopify financial_status: pending, authorized, partially_paid, paid, partially_refunded, refunded, voided';