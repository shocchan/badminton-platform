-- Migration: Add payment fields and remove cancel_fee
-- Run this if you have an existing tournament table

-- Step 1: Add new columns for payment
ALTER TABLE tournaments ADD COLUMN payment_required BOOLEAN DEFAULT false;
ALTER TABLE tournaments ADD COLUMN payment_deadline DATE;
ALTER TABLE tournaments ADD COLUMN bank_account TEXT;
ALTER TABLE tournaments ADD COLUMN paypay_id TEXT;

-- Step 2 (Optional): Remove cancel_fee if you want to clean up
-- ALTER TABLE tournaments DROP COLUMN cancel_fee;

-- If you need to backfill data, run:
-- UPDATE tournaments SET payment_required = false WHERE payment_required IS NULL;
