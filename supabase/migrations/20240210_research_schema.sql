-- Create research table
create table if not exists research (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  query text not null,
  content text not null,
  word_count integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create research_edits table to store edit history
create table if not exists research_edits (
  id uuid default gen_random_uuid() primary key,
  research_id uuid references research(id) on delete cascade,
  content text not null,
  word_count integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  expires_at timestamp with time zone default timezone('utc'::text, now() + interval '5 minutes')
);

-- Create research_sources table
create table if not exists research_sources (
  id uuid default gen_random_uuid() primary key,
  research_id uuid references research(id) on delete cascade,
  source_id text not null,
  title text not null,
  url text not null,
  snippet text,
  favicon_url text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create research_metadata table
create table if not exists research_metadata (
  id uuid default gen_random_uuid() primary key,
  research_id uuid references research(id) on delete cascade,
  source_count integer not null,
  citations_used integer not null,
  source_usage_percent integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create indexes for better query performance
create index if not exists research_user_id_idx on research(user_id);
create index if not exists research_edits_research_id_idx on research_edits(research_id);
create index if not exists research_sources_research_id_idx on research_sources(research_id);
create index if not exists research_metadata_research_id_idx on research_metadata(research_id);

-- Add RLS (Row Level Security) policies
alter table research enable row level security;
alter table research_edits enable row level security;
alter table research_sources enable row level security;
alter table research_metadata enable row level security;

-- Create policies
create policy "Users can view their own research"
  on research for select
  using (auth.uid() = user_id);

create policy "Users can insert their own research"
  on research for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own research"
  on research for update
  using (auth.uid() = user_id);

-- Edits policies
create policy "Users can view their research edits"
  on research_edits for select
  using (exists (
    select 1 from research
    where research.id = research_edits.research_id
    and research.user_id = auth.uid()
  ));

create policy "Users can insert research edits"
  on research_edits for insert
  with check (exists (
    select 1 from research
    where research.id = research_edits.research_id
    and research.user_id = auth.uid()
  ));

-- Sources policies
create policy "Users can view their research sources"
  on research_sources for select
  using (exists (
    select 1 from research
    where research.id = research_sources.research_id
    and research.user_id = auth.uid()
  ));

create policy "Users can insert research sources"
  on research_sources for insert
  with check (exists (
    select 1 from research
    where research.id = research_sources.research_id
    and research.user_id = auth.uid()
  ));

-- Metadata policies
create policy "Users can view their research metadata"
  on research_metadata for select
  using (exists (
    select 1 from research
    where research.id = research_metadata.research_id
    and research.user_id = auth.uid()
  ));

create policy "Users can insert research metadata"
  on research_metadata for insert
  with check (exists (
    select 1 from research
    where research.id = research_metadata.research_id
    and research.user_id = auth.uid()
  )); 