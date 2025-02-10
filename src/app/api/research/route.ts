import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleSearchClient } from '@/lib/google'
import { NextResponse } from 'next/server'

const googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const googleSearch = new GoogleSearchClient(
  process.env.GOOGLE_API_KEY || '',
  process.env.GOOGLE_CSE_ID || ''
)

// Search configuration
const QUICK_RESEARCH_MIN_SOURCES = 10
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

// Helper function to format content to HTML
function formatContentToHTML(content: string, sources: any[]): string {
  // Remove the sources section from the main content if it exists
  const mainContent = content.split(/References:|Sources:|Bibliography:/i)[0];

  // Ensure the content is properly formatted
  if (!mainContent?.trim()) {
    throw new Error('Content generation failed - empty response received');
  }

  // Helper function to generate citation based on mode
  function getCitation(source: any): string {
    try {
      const url = new URL(source.url);
      const hostname = url.hostname.replace(/^www\./, '');
      return `<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="citation" title="${source.title}">[${source.id} ${hostname}]</a>`;
    } catch {
      return `<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="citation" title="${source.title}">[${source.id}]</a>`;
    }
  }

  // Convert markdown to HTML while preserving editability
  let html = mainContent
    // Format headings (handle all levels from h1 to h6)
    .replace(/^#{6}\s+(.*)$/gm, '<h6>$1</h6>')
    .replace(/^#{5}\s+(.*)$/gm, '<h5>$1</h5>')
    .replace(/^#{4}\s+(.*)$/gm, '<h4>$1</h4>')
    .replace(/^#{3}\s+(.*)$/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.*)$/gm, '<h2>$1</h2>')
    .replace(/^#{1}\s+(.*)$/gm, '<h1>$1</h1>')
    // Format bold and italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Format lists
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li.*\n*)+/g, '<ul>$&</ul>')
    // Format citations with appropriate style based on mode
    .replace(/\[(\d+)\]/g, (match, id) => {
      const source = sources.find(s => s.id === id);
      if (!source) return match;
      try {
        const url = new URL(source.url);
        const hostname = url.hostname.replace(/^www\./, '');
        return `<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="citation" title="${source.title}">[${id} ${hostname}]</a>`;
      } catch {
        return `<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="citation" title="${source.title}">[${id}]</a>`;
      }
    });

  // Format paragraphs (must be done last to avoid interfering with other elements)
  html = html.replace(/^(?!<h[1-6]|<ul|<ol|<li|<blockquote|<pre|<p)(.+)$/gm, '<p>$1</p>');
  
  // Clean up empty lines and normalize spacing
  html = html
    .replace(/\n+/g, '\n')
    .replace(/^\s+|\s+$/g, '');

  // Validate the HTML structure
  if (!html?.trim() || html.length < 100) {
    throw new Error('Content generation failed - response too short');
  }

  return html;
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  pagemap?: {
    metatags?: Array<{
      'og:title'?: string;
      'og:description'?: string;
      'og:image'?: string;
    }>;
    cse_image?: Array<{
      src: string;
    }>;
  };
}

async function searchWithPriority(query: string): Promise<SearchResult[]> {
  const minSources = QUICK_RESEARCH_MIN_SOURCES
  let allResults: SearchResult[] = []
  
  try {
    // First try academic sources
    const academicQuery = `${query} site:(${ACADEMIC_DOMAINS.join(' OR ')})`
    await checkRateLimit()
    const academicResponse = await googleSearch.search(academicQuery)
    
    if (academicResponse?.items && academicResponse.items.length > 0) {
      allResults = [...academicResponse.items]
    }

    // If we don't have enough sources, search general sources but exclude common forums
    if (allResults.length < minSources) {
      await checkRateLimit()
      const generalQuery = `${query} -site:(reddit.com OR quora.com OR medium.com)`
      const generalResponse = await googleSearch.search(generalQuery)
      
      if (generalResponse?.items && generalResponse.items.length > 0) {
        allResults = [...allResults, ...generalResponse.items]
      }
    }

    // If still not enough sources, try one more general search
    if (allResults.length < minSources) {
      await checkRateLimit()
      const backupQuery = `${query} research paper`
      const backupResponse = await googleSearch.search(backupQuery)
      
      if (backupResponse?.items && backupResponse.items.length > 0) {
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

async function generateContent(query: string, sources: any[]) {
  try {
    const prompt = `Based on the following sources, write a focused research analysis about "${query}".

Sources:
${sources.map(s => `[${s.id}] ${s.title}\n${s.snippet}\n`).join('\n')}

Requirements:
- Write a comprehensive analysis of at least 500 words
- Structure the content as follows:
  1. Introduction (brief overview)
  2. Main Analysis (detailed discussion)
  3. Research Methods (methodology overview)
  4. Data Analysis (key findings)
  5. Conclusion (summary and implications)
- Use ONLY source numbers for citations: [1], [2], etc.
- DO NOT add any text after the citation number
- Compare different viewpoints
- Draw evidence-based conclusions
- Use clear, academic language
- Support claims with citations
- Include key statistics and data points
- DO NOT include a references section
- DO NOT stop in the middle of a sentence

Use section headers to clearly separate each part of the analysis.`;

    // Using Gemini model with adjusted parameters for longer content
    const geminiModel = googleAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.8,  // Increased for more verbose output
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.9,  // Increased for more diverse output
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
    
    const content = geminiResult.response.text().trim()
    
    if (!content) {
      throw new Error('No content generated by the AI model.')
    }

    // Single word count check
    const wordCount = content.split(/\s+/).length
    console.log(`Generated content word count: ${wordCount}`)
    
    if (wordCount < 500) {
      throw new Error(`Generated content too short: ${wordCount} words. Please try again.`)
    }

    return content;

  } catch (error) {
    console.error('Content generation error:', error)
    let errorMessage = 'Failed to generate content.'
    
    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        errorMessage = 'AI model rate limit exceeded. Please try again in a few moments.'
      } else if (error.message.includes('quota')) {
        errorMessage = 'AI model quota exceeded. Please try again later.'
      } else if (error.message.includes('invalid')) {
        errorMessage = 'Invalid request to AI model. Please try a different query.'
      } else {
        errorMessage = error.message // Use the actual error message
      }
    }
    
    throw new Error(errorMessage)
  }
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();
    const query = messages[0].content;

    const sources = await searchWithPriority(query);
    
    // Format sources
    const formattedSources = sources.map((source, index) => ({
      id: String(index + 1),
      title: source.title,
      url: source.link,
      snippet: source.snippet
    }));

    // Generate content using the model
    const content = await generateContent(query, formattedSources);
    
    // Calculate metadata
    const wordCount = content.trim().split(/\s+/).length;
    const citationsUsed = (content.match(/\[\d+\]/g) || []).length;
    
    return NextResponse.json({
      content: formatContentToHTML(content, formattedSources),
      sources: formattedSources,
      metadata: {
        sourceCount: formattedSources.length,
        citationsUsed,
        sourceUsagePercent: Math.round(citationsUsed / formattedSources.length * 100),
        wordCount,
        model: 'gemini-2.0-flash'
      }
    });
  } catch (error: any) {
    console.error('Research error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: error.status || 500 }
    );
  }
}

// Helper function to safely extract favicon from search result
function getFavicon(item: SearchResult): string | undefined {
  try {
    // First try to get the favicon from meta tags
    const metaFavicon = item.pagemap?.metatags?.[0]?.['og:image'] || 
                       item.pagemap?.cse_image?.[0]?.src;
    
    if (metaFavicon) {
      return metaFavicon;
    }

    // If no meta favicon, try to generate a DuckDuckGo favicon URL as primary source
    // This is more reliable than Google's favicon service
    const url = new URL(item.link);
    const hostname = url.hostname.replace(/^www\./, '');
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;

  } catch {
    // If URL parsing fails, return undefined
    return undefined;
  }
} 