import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleSearchClient } from '@/lib/google'
import { ModelType } from '@/types'
import OpenAI from 'openai'

const googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const googleSearch = new GoogleSearchClient(
  process.env.GOOGLE_API_KEY || '',
  process.env.GOOGLE_CSE_ID || ''
)

// Search configuration
const QUICK_RESEARCH_MIN_SOURCES = 10
const DEEP_RESEARCH_MIN_SOURCES = 15
const ACADEMIC_DOMAINS = [
  'scholar.google.com',
  'arxiv.org',
  'researchgate.net',
  'sciencedirect.com',
  'springer.com',
  'nature.com',
  'science.org',
  'ieee.org',
  'acm.org',
  'jstor.org',
  'pubmed.ncbi.nlm.nih.gov',
  'academia.edu',
  '.edu'
]

// Add rate limiting for Google Search
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5 // Reduced from 10 to 5
const MIN_DELAY_BETWEEN_REQUESTS = 3000 // Increased from 2000 to 3000 ms
let requestTimestamps: number[] = []
let lastRequestTime = 0

function checkRateLimit() {
  const now = Date.now()
  
  // Clean up old timestamps
  requestTimestamps = requestTimestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW)
  
  // Check if we need to wait for the minimum delay
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_DELAY_BETWEEN_REQUESTS) {
    const waitTime = MIN_DELAY_BETWEEN_REQUESTS - timeSinceLastRequest
    return new Promise(resolve => setTimeout(resolve, waitTime))
  }
  
  // Check if we've hit the rate limit
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestTimestamp = Math.min(...requestTimestamps)
    const timeToWait = RATE_LIMIT_WINDOW - (now - oldestTimestamp)
    throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(timeToWait / 1000)} seconds before trying again.`)
  }
  
  requestTimestamps.push(now)
  lastRequestTime = now
  return Promise.resolve()
}

export const runtime = 'edge'
export const maxDuration = 300

function formatContentToHTML(text: string, sources: Array<{ id: string; url: string }>): string {
  // Remove the sources section from the main content if it exists
  const mainContent = text.split(/References:|Sources:|Bibliography:/i)[0]

  // Ensure the content is properly formatted
  if (!mainContent?.trim()) {
    throw new Error('Content generation failed - empty response received')
  }

  // Convert markdown to HTML while preserving editability
  const html = mainContent
    // Format headings (handle all levels from h1 to h6)
    .replace(/^#{6}\s+(.*)$/gm, '<h6 class="text-base font-semibold my-2">$1</h6>')
    .replace(/^#{5}\s+(.*)$/gm, '<h5 class="text-lg font-semibold my-2">$1</h5>')
    .replace(/^#{4}\s+(.*)$/gm, '<h4 class="text-xl font-semibold my-2">$1</h4>')
    .replace(/^#{3}\s+(.*)$/gm, '<h3 class="text-2xl font-semibold my-3">$1</h3>')
    .replace(/^#{2}\s+(.*)$/gm, '<h2 class="text-3xl font-semibold my-3">$1</h2>')
    .replace(/^#{1}\s+(.*)$/gm, '<h1 class="text-4xl font-semibold my-4">$1</h1>')
    // Format bold and italic
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    // Format paragraphs
    .replace(/^(?!<h[1-6]|<ul|<ol|<li|<blockquote|<pre|<p).*$/gm, '<p class="my-3 leading-7">$&</p>')
    // Format lists
    .replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>')
    .replace(/(<li.*\n*)+/g, '<ul class="list-disc my-4 ml-6 space-y-2">$&</ul>')
    // Format citations with links
    .replace(/\[([^\]]+)\]/g, (match, ids: string) => {
      const citations = ids.split(/,\s*/).map(id => id.trim());
      return citations.map(id => {
        const source = sources.find(s => s.id === id);
        return source
          ? `<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-2 py-0.5 mx-1 bg-zinc-800 hover:bg-zinc-700 rounded text-sm transition-colors">[${id}]</a>`
          : `[${id}]`;
      }).join('');
    });

  // Validate the HTML structure
  if (!html?.trim() || html.length < 100) {
    throw new Error('Content generation failed - response too short')
  }

  return `<div class="research-content prose prose-invert max-w-none">
    <div class="space-y-4">
      ${html}
    </div>
  </div>`;
}

async function searchWithPriority(query: string): Promise<any[]> {
  const minSources = QUICK_RESEARCH_MIN_SOURCES
  let allResults: any[] = []
  
  try {
    // First try academic sources
    const academicQuery = `${query} site:(${ACADEMIC_DOMAINS.join(' OR ')})`
    await checkRateLimit()
    const academicResponse = await googleSearch.search(academicQuery)
    
    if (academicResponse?.items?.length > 0) {
      allResults = [...academicResponse.items]
    }

    // If we don't have enough sources, search general sources but exclude common forums
    if (allResults.length < minSources) {
      await checkRateLimit()
      const generalQuery = `${query} -site:(reddit.com OR quora.com OR medium.com)`
      const generalResponse = await googleSearch.search(generalQuery)
      
      if (generalResponse?.items?.length > 0) {
        allResults = [...allResults, ...generalResponse.items]
      }
    }

    // If still not enough sources, try one more general search
    if (allResults.length < minSources) {
      await checkRateLimit()
      const backupQuery = `${query} research paper`
      const backupResponse = await googleSearch.search(backupQuery)
      
      if (backupResponse?.items?.length > 0) {
        allResults = [...allResults, ...backupResponse.items]
      }
    }

    // Deduplicate results by URL
    const uniqueResults = Array.from(
      new Map(allResults.map(item => [item.link, item])).values()
    )

    return uniqueResults.slice(0, Math.max(minSources, uniqueResults.length))
  } catch (error) {
    console.error('Search error:', error)
    throw new Error('Failed to search for sources. Please try again.')
  }
}

export async function POST(req: Request) {
  try {
    const { messages, model = 'gemini-2.0-flash' } = await req.json()
    const query = messages[0].content

    if (!query?.trim()) {
      throw new Error('Please provide a search query.')
    }

    try {
      // Step 1: Search for relevant sources with priority and rate limiting
      const searchResults = await searchWithPriority(query)
      
      if (!searchResults?.length) {
        throw new Error(
          'No relevant sources found. Please try:\n' +
          '- Using more specific keywords\n' +
          '- Removing special characters\n' +
          '- Checking for typos\n' +
          '- Broadening your search terms'
        )
      }

      // Process search results
      let sources = searchResults
        .map((item, i) => ({
          id: (i + 1).toString(),
          title: item.title || '',
          url: item.link || '',
          snippet: item.snippet || '',
          favicon: item.pagemap?.cse_image?.[0]?.src
        }))
        .filter(source => source.url && source.title)

      // Step 3: Search for academic papers mentioned in sources
      const academicPattern = /([A-Za-z-]+(?:\s*(?:&|and)\s*[A-Za-z-]+)?(?:\s*et al\.?)?)(?:\s*\(?(\d{4})\)?)/g;
      const academicCitations = new Set<string>();
      
      sources.forEach(source => {
        if (source.snippet) {
          const matches = source.snippet.matchAll(academicPattern);
          for (const match of matches) {
            if (match[1] && match[2]) {
              academicCitations.add(`${match[1].trim()} ${match[2]}`);
            }
          }
        }
      });

      // Step 4: Add academic sources
      if (academicCitations.size > 0) {
        try {
          // Process citations one at a time to better handle errors
          for (const citation of academicCitations) {
            try {
              await checkRateLimit();
              const result = await googleSearch.search(`${citation} research paper pdf`, { num: 1 });
              
              if (result?.items?.length > 0) {
                const newSources = result.items
                  .map((item, i) => ({
                    id: (sources.length + i + 1).toString(),
                    title: item.title || '',
                    url: item.link || '',
                    snippet: item.snippet || '',
                    favicon: item.pagemap?.cse_image?.[0]?.src
                  }))
                  .filter(source => 
                    source.url && 
                    source.title && 
                    !sources.some(existing => existing.url === source.url)
                  );

                if (newSources.length > 0) {
                  sources = [...sources, ...newSources];
                }
              }
            } catch (error) {
              console.warn(`Failed to search for citation "${citation}":`, error);
              continue;
            }
          }
        } catch (error) {
          console.warn('Failed to process academic citations:', error);
        }
      }

      // Ensure we have at least the minimum number of sources
      if (sources.length < QUICK_RESEARCH_MIN_SOURCES) {
        try {
          await checkRateLimit();
          const backupResults = await googleSearch.search(
            `${query} research paper site:scholar.google.com -site:(reddit.com OR quora.com OR medium.com)`, 
            { num: Math.max(5, QUICK_RESEARCH_MIN_SOURCES - sources.length) }
          );
          
          if (backupResults?.items?.length > 0) {
            const backupSources = backupResults.items
              .map((item, i) => ({
                id: (sources.length + i + 1).toString(),
                title: item.title || '',
                url: item.link || '',
                snippet: item.snippet || '',
                favicon: item.pagemap?.cse_image?.[0]?.src
              }))
              .filter(source => 
                source.url && 
                source.title && 
                !sources.some(existing => existing.url === source.url)
              );

            sources = [...sources, ...backupSources];
          }
        } catch (error) {
          console.warn('Failed to fetch backup sources:', error);
        }
      }

      // Step 5: Generate research using selected model
      let content: string
      try {
        const prompt = `Based on the following sources, write a comprehensive and in-depth research analysis about "${query}". Include relevant citations using [1], [2], etc. format. Focus on key findings, methodologies, and conclusions. Be objective and analytical in your writing style. Provide detailed examples and evidence to support each point.

Sources:
${sources.map(s => `[${s.id}] ${s.title}\n${s.snippet}\n`).join('\n')}

Additional requirements:
- Minimum 1200 words with detailed analysis
- Include clear section headings with introduction and conclusion
- Cite specific findings from sources with direct quotes where relevant
- Compare and contrast different viewpoints and methodologies
- Draw evidence-based conclusions with practical implications
- Include subsections under main topics for better organization
- Analyze trends and future implications
- Consider limitations and areas for future research

Writing style:
- Use clear, academic language
- Maintain objective tone throughout
- Support all claims with evidence and citations
- Provide detailed explanations of complex concepts
- Include relevant statistics and data points
- Draw connections between different sources
`

        // Using Gemini model
        const geminiModel = googleAI.getGenerativeModel({ 
          model: 'gemini-2.0-flash',
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 8192,
            topK: 40,
            topP: 0.8,
          }
        });

        const geminiResult = await geminiModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            stopSequences: ["</div>"],
          }
        })
        
        if (!geminiResult.response.text()) {
          throw new Error('Empty response from Gemini')
        }
        
        content = geminiResult.response.text()
        
        // Validate content length
        if (content.length < 500) {
          throw new Error('Generated content too short')
        }

        if (!content?.trim()) {
          throw new Error('No content generated by the AI model.')
        }

      } catch (error) {
        let errorMessage = 'Failed to generate content.'
        
        if (error instanceof Error) {
          if (error.message.includes('rate limit')) {
            errorMessage = 'AI model rate limit exceeded. Please try again in a few moments.'
          } else if (error.message.includes('quota')) {
            errorMessage = 'AI model quota exceeded. Please try again later.'
          } else if (error.message.includes('invalid')) {
            errorMessage = 'Invalid request to AI model. Please try a different query.'
          }
          
          throw new Error(`${errorMessage}\nDetails: ${error.message}`)
        }
        
        throw new Error(errorMessage)
      }

      // Format content and calculate metadata
      const formattedContent = formatContentToHTML(content, sources)
      const wordCount = content.trim().split(/\s+/).length
      const charCount = content.length

      const metadata = {
        sourceCount: sources.length,
        citationsUsed: (content.match(/\[\d+\]/g) || []).length,
        sourceUsagePercent: Math.round((content.match(/\[\d+\]/g) || []).length / sources.length * 100),
        wordCount,
        charCount,
        model: 'gemini-2.0-flash'
      }

      return new Response(JSON.stringify({
        content: formattedContent,
        sources,
        metadata
      }), {
        headers: { 'Content-Type': 'application/json' }
      })

    } catch (error) {
      console.error('Research API Error:', error)
      
      let statusCode = 500
      let errorMessage = 'An unexpected error occurred.'
      let details = 'Please try again later.'

      if (error instanceof Error) {
        errorMessage = error.message
        
        if (error.message.includes('rate limit')) {
          statusCode = 429
          details = 'The API is rate limited. Please wait before trying again.'
        } else if (error.message.includes('quota')) {
          statusCode = 429
          details = 'API quota exceeded. Please try again later.'
        } else if (error.message.includes('invalid')) {
          statusCode = 400
          details = 'Invalid request. Please check your input and try again.'
        }
      }

      return new Response(JSON.stringify({
        error: errorMessage,
        details
      }), {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('Research API Error:', error)
    
    let statusCode = 500
    let errorMessage = 'An unexpected error occurred.'
    let details = 'Please try again later.'

    if (error instanceof Error) {
      errorMessage = error.message
      
      if (error.message.includes('rate limit')) {
        statusCode = 429
        details = 'The API is rate limited. Please wait before trying again.'
      } else if (error.message.includes('quota')) {
        statusCode = 429
        details = 'API quota exceeded. Please try again later.'
      } else if (error.message.includes('invalid')) {
        statusCode = 400
        details = 'Invalid request. Please check your input and try again.'
      }
    }

    return new Response(JSON.stringify({
      error: errorMessage,
      details
    }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    })
  }
} 