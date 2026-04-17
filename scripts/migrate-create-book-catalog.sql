-- Migration: Create book_catalog table
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- book_catalog is a shared reference table — one row per unique magic book.
-- Read-only from the app. Written by scrapers and the seed script.

CREATE TABLE IF NOT EXISTS book_catalog (
  norm_key        TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  author          TEXT,
  publisher       TEXT,
  year            TEXT,
  cover_url       TEXT,
  cover_source    TEXT CHECK (cover_source IN ('magicref', 'supabase_storage', 'murphys', 'penguin', 'vanishing')),
  in_print        TEXT CHECK (in_print IN ('confirmed_inprint', 'confirmed_oop', 'likely_inprint', 'unknown')),
  price_msrp      NUMERIC,
  price_secondary NUMERIC,
  price_ebay      NUMERIC,
  price_retail    NUMERIC,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes for Add-flow lookups
CREATE INDEX IF NOT EXISTS idx_book_catalog_title  ON book_catalog (lower(title));
CREATE INDEX IF NOT EXISTS idx_book_catalog_author ON book_catalog (lower(author));

-- Public read access (reference data — no user data here)
ALTER TABLE book_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
  ON book_catalog
  FOR SELECT
  USING (true);

-- Service role retains full write access via RLS bypass (no explicit INSERT policy needed)
