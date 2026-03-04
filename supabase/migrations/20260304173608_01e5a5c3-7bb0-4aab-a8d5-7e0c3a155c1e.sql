
-- Critical indexes for inventory_snapshot performance
CREATE INDEX IF NOT EXISTS idx_inv_snapshot_date_sku ON inventory_snapshot (snapshot_date, sku);
CREATE INDEX IF NOT EXISTS idx_inv_snapshot_date_location ON inventory_snapshot (snapshot_date, location_id);
CREATE INDEX IF NOT EXISTS idx_inv_snapshot_date ON inventory_snapshot (snapshot_date);
