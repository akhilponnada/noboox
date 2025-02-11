import { supabase } from './supabase'

export interface Research {
  id: string
  user_id: string
  query: string
  content: string
  word_count: number
  created_at: string
  updated_at: string
}

export interface ResearchEdit {
  id: string
  research_id: string
  content: string
  word_count: number
  created_at: string
  expires_at: string
}

export interface ResearchSource {
  id: string
  research_id: string
  source_id: string
  title: string
  url: string
  snippet?: string
  favicon_url?: string
  created_at: string
}

export interface ResearchMetadata {
  id: string
  research_id: string
  source_count: number
  citations_used: number
  source_usage_percent: number
  created_at: string
}

export async function createResearch(
  userId: string,
  query: string,
  content: string,
  wordCount: number,
  sources: Array<{
    id: string
    title: string
    url: string
    snippet?: string
    favicon?: string
  }>,
  metadata: {
    sourceCount: number
    citationsUsed: number
    sourceUsagePercent: number
  }
) {
  console.log('Creating research with data:', { userId, query, content: content.substring(0, 100) + '...', wordCount });
  
  const { data: research, error: researchError } = await supabase
    .from('research')
    .insert({
      user_id: userId,
      query,
      content,
      word_count: wordCount,
    })
    .select()
    .single()

  if (researchError) {
    console.error('Error creating research:', researchError);
    throw researchError;
  }
  
  if (!research) {
    console.error('No research data returned after insert');
    throw new Error('Failed to create research')
  }

  console.log('Research created successfully:', research.id);

  // Insert sources
  console.log('Inserting sources:', sources.length);
  const { error: sourcesError } = await supabase.from('research_sources').insert(
    sources.map(source => ({
      research_id: research.id,
      source_id: source.id,
      title: source.title,
      url: source.url,
      snippet: source.snippet,
      favicon_url: source.favicon,
    }))
  )

  if (sourcesError) {
    console.error('Error inserting sources:', sourcesError);
    throw sourcesError;
  }

  console.log('Sources inserted successfully');

  // Insert metadata
  console.log('Inserting metadata:', metadata);
  const { error: metadataError } = await supabase.from('research_metadata').insert({
    research_id: research.id,
    source_count: metadata.sourceCount,
    citations_used: metadata.citationsUsed,
    source_usage_percent: metadata.sourceUsagePercent,
  })

  if (metadataError) {
    console.error('Error inserting metadata:', metadataError);
    throw metadataError;
  }

  console.log('Metadata inserted successfully');
  return research;
}

export async function updateResearchContent(
  researchId: string,
  content: string,
  wordCount: number
) {
  // Create edit history first
  const { error: editError } = await supabase.from('research_edits').insert({
    research_id: researchId,
    content,
    word_count: wordCount,
  })

  if (editError) throw editError

  // Update research content
  const { data: research, error: updateError } = await supabase
    .from('research')
    .update({
      content,
      word_count: wordCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', researchId)
    .select()
    .single()

  if (updateError) throw updateError
  return research
}

export async function getResearch(researchId: string) {
  const { data: research, error: researchError } = await supabase
    .from('research')
    .select('*')
    .eq('id', researchId)
    .single()

  if (researchError) throw researchError
  if (!research) throw new Error('Research not found')

  // Get sources
  const { data: sources, error: sourcesError } = await supabase
    .from('research_sources')
    .select('*')
    .eq('research_id', researchId)

  if (sourcesError) throw sourcesError

  // Get metadata
  const { data: metadata, error: metadataError } = await supabase
    .from('research_metadata')
    .select('*')
    .eq('research_id', researchId)
    .single()

  if (metadataError) throw metadataError

  // Get recent edits (not expired)
  const { data: edits, error: editsError } = await supabase
    .from('research_edits')
    .select('*')
    .eq('research_id', researchId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (editsError) throw editsError

  return {
    ...research,
    sources,
    metadata,
    edits,
  }
}

export async function getUserResearch(userId: string) {
  const { data: researches, error } = await supabase
    .from('research')
    .select(`
      *,
      research_metadata (
        source_count,
        citations_used,
        source_usage_percent
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return researches
} 