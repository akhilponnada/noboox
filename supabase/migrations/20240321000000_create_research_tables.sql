-- Create research table
CREATE TABLE research (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create research_edits table
CREATE TABLE research_edits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    research_id UUID REFERENCES research(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

-- Create research_sources table
CREATE TABLE research_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    research_id UUID REFERENCES research(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    snippet TEXT,
    favicon_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create research_metadata table
CREATE TABLE research_metadata (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    research_id UUID REFERENCES research(id) ON DELETE CASCADE,
    source_count INTEGER NOT NULL DEFAULT 0,
    citations_used INTEGER NOT NULL DEFAULT 0,
    source_usage_percent DECIMAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_research_metadata UNIQUE (research_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_research_user_id ON research(user_id);
CREATE INDEX idx_research_edits_research_id ON research_edits(research_id);
CREATE INDEX idx_research_sources_research_id ON research_sources(research_id);
CREATE INDEX idx_research_sources_source_id ON research_sources(source_id);

-- Enable Row Level Security
ALTER TABLE research ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_metadata ENABLE ROW LEVEL SECURITY;

-- Create policies
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