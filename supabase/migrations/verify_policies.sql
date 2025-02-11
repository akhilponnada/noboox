-- First, verify tables exist and RLS is enabled
DO $$
BEGIN
    -- Create tables if they don't exist
    CREATE TABLE IF NOT EXISTS research (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        query TEXT NOT NULL,
        content TEXT NOT NULL,
        word_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS research_edits (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        research_id UUID REFERENCES research(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        word_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
    );

    CREATE TABLE IF NOT EXISTS research_sources (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        research_id UUID REFERENCES research(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        snippet TEXT,
        favicon_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS research_metadata (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        research_id UUID REFERENCES research(id) ON DELETE CASCADE,
        source_count INTEGER NOT NULL DEFAULT 0,
        citations_used INTEGER NOT NULL DEFAULT 0,
        source_usage_percent DECIMAL NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT unique_research_metadata UNIQUE (research_id)
    );
END $$;

-- Enable RLS on all tables
ALTER TABLE research ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_metadata ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own research" ON research;
DROP POLICY IF EXISTS "Users can insert their own research" ON research;
DROP POLICY IF EXISTS "Users can update their own research" ON research;
DROP POLICY IF EXISTS "Users can delete their own research" ON research;
DROP POLICY IF EXISTS "Users can view edits of their research" ON research_edits;
DROP POLICY IF EXISTS "Users can insert edits for their research" ON research_edits;
DROP POLICY IF EXISTS "Users can view sources of their research" ON research_sources;
DROP POLICY IF EXISTS "Users can insert sources for their research" ON research_sources;
DROP POLICY IF EXISTS "Users can view metadata of their research" ON research_metadata;
DROP POLICY IF EXISTS "Users can insert metadata for their research" ON research_metadata;
DROP POLICY IF EXISTS "Users can update metadata of their research" ON research_metadata;

-- Recreate all policies
CREATE POLICY "Users can view their own research"
    ON research FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own research"
    ON research FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own research"
    ON research FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own research"
    ON research FOR DELETE
    USING (auth.uid() = user_id);

-- Policies for research_edits
CREATE POLICY "Users can view edits of their research"
    ON research_edits FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM research
        WHERE research.id = research_edits.research_id
        AND research.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert edits for their research"
    ON research_edits FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM research
        WHERE research.id = research_edits.research_id
        AND research.user_id = auth.uid()
    ));

-- Policies for research_sources
CREATE POLICY "Users can view sources of their research"
    ON research_sources FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM research
        WHERE research.id = research_sources.research_id
        AND research.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert sources for their research"
    ON research_sources FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM research
        WHERE research.id = research_sources.research_id
        AND research.user_id = auth.uid()
    ));

-- Policies for research_metadata
CREATE POLICY "Users can view metadata of their research"
    ON research_metadata FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM research
        WHERE research.id = research_metadata.research_id
        AND research.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert metadata for their research"
    ON research_metadata FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM research
        WHERE research.id = research_metadata.research_id
        AND research.user_id = auth.uid()
    ));

CREATE POLICY "Users can update metadata of their research"
    ON research_metadata FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM research
        WHERE research.id = research_metadata.research_id
        AND research.user_id = auth.uid()
    )); 