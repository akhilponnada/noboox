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
function formatContentToHTML(content: string, sources: any[], isDeepResearch: boolean = false): string {
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

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

async function fetchSerperSources(query: string) {
  if (!SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY is not configured in environment variables');
  }
  
  const sources = [];
  let page = 0;
  
  // Fetch academic sources first
  try {
    const academicResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: `${query} site:scholar.google.com OR site:researchgate.net OR site:academia.edu OR site:arxiv.org OR site:sciencedirect.com`,
        page: page,
        num: 30
      })
    });

    if (!academicResponse.ok) {
      const errorData = await academicResponse.json().catch(() => ({}));
      console.error('Serper Academic Search Error:', {
        status: academicResponse.status,
        statusText: academicResponse.statusText,
        error: errorData
      });
      throw new Error(`Serper API returned ${academicResponse.status}: ${academicResponse.statusText}`);
    }

    const academicData = await academicResponse.json();
    if (academicData.organic) {
      sources.push(...academicData.organic.map((result: any) => ({
        title: result.title,
        url: result.link,
        snippet: result.snippet,
        date: result.date,
        position: result.position,
        attributes: result.attributes || []
      })));
    }

    // Now fetch general research sources if we don't have enough
    if (sources.length < 30) {
      const generalResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: `${query} research paper -site:youtube.com -site:reddit.com -site:quora.com`,
          page: page,
          num: 30 - sources.length
        })
      });

      if (!generalResponse.ok) {
        const errorData = await generalResponse.json().catch(() => ({}));
        console.error('Serper General Search Error:', {
          status: generalResponse.status,
          statusText: generalResponse.statusText,
          error: errorData
        });
        throw new Error(`Serper API returned ${generalResponse.status}: ${generalResponse.statusText}`);
      }

      const generalData = await generalResponse.json();
      if (generalData.organic) {
        sources.push(...generalData.organic.map((result: any) => ({
          title: result.title,
          url: result.link,
          snippet: result.snippet,
          date: result.date,
          position: result.position,
          attributes: result.attributes || []
        })));
      }
    }

    // Process and add favicons to sources
    const processedSources = sources.map(source => {
      let favicon;
      try {
        const url = new URL(source.url);
        const hostname = url.hostname.replace(/^www\./, '');
        favicon = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
      } catch {
        favicon = undefined;
      }
      return {
        ...source,
        favicon
      };
    });

    // Deduplicate sources and ensure exactly 30 sources
    const uniqueSources = Array.from(
      new Map(processedSources.map(item => [item.url, item])).values()
    );

    // Sort by relevance and take exactly 30 sources
    return uniqueSources
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .slice(0, 30);

  } catch (error) {
    console.error('Error fetching from Serper:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch sources from Serper');
  }
}

async function generateDeepResearch(query: string, sources: any[]) {
  // Instead of fixed percentages, group sources by relevance to each section
  const sourceGroups = {
    introduction: sources.filter(s => 
      s.title.toLowerCase().includes('introduction') || 
      s.title.toLowerCase().includes('overview') ||
      s.snippet.toLowerCase().includes('background') ||
      s.snippet.toLowerCase().includes('context')
    ),
    literature: sources.filter(s => 
      s.title.toLowerCase().includes('review') ||
      s.title.toLowerCase().includes('study') ||
      s.title.toLowerCase().includes('research') ||
      s.snippet.toLowerCase().includes('findings') ||
      s.snippet.toLowerCase().includes('analysis')
    ),
    methodology: sources.filter(s => 
      s.title.toLowerCase().includes('method') ||
      s.title.toLowerCase().includes('approach') ||
      s.snippet.toLowerCase().includes('methodology') ||
      s.snippet.toLowerCase().includes('procedure')
    ),
    analysis: sources.filter(s => 
      s.title.toLowerCase().includes('result') ||
      s.title.toLowerCase().includes('analysis') ||
      s.title.toLowerCase().includes('finding') ||
      s.snippet.toLowerCase().includes('data') ||
      s.snippet.toLowerCase().includes('outcome')
    ),
    conclusion: sources.filter(s => 
      s.title.toLowerCase().includes('conclusion') ||
      s.title.toLowerCase().includes('implication') ||
      s.snippet.toLowerCase().includes('future') ||
      s.snippet.toLowerCase().includes('recommend')
    )
  };

  // Add remaining sources to sections that need more
  const usedSources = new Set([
    ...sourceGroups.introduction,
    ...sourceGroups.literature,
    ...sourceGroups.methodology,
    ...sourceGroups.analysis,
    ...sourceGroups.conclusion
  ]);

  const remainingSources = sources.filter(s => !usedSources.has(s));
  sourceGroups.literature.push(...remainingSources);

  try {
    const geminiModel = googleAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.8,
        stopSequences: ["</div>", "Sources:", "References:", "Bibliography:"]
      }
    });

    let allContent = [];
    let previousContent = '';
    
    // Generate content using relevant sources for each section
    const prompts = [
      // Introduction
      `Write the introduction section of a comprehensive research analysis about "${query}" using these relevant sources:

${sourceGroups.introduction.map((s, idx) => `[${s.id}] ${s.title}
Key Points: ${s.snippet}
URL: ${s.url}
`).join('\n')}

Write a detailed introduction (minimum 200 words) that:
- Introduces the research topic
- Provides background context
- States the research objectives
- Outlines the paper structure

Requirements:
- Use academic language
- For citations, use the format [X] where X is the source number
- Each citation should be a clickable link to the source URL
- DO NOT include a references section
- DO NOT stop in the middle of a sentence`,

      // Literature Review
      `Continue the research analysis about "${query}" by writing the literature review section. Here's what was covered in the introduction:

${previousContent}

Use these relevant sources for the literature review:
${sourceGroups.literature.map((s, idx) => `[${s.id}] ${s.title}
Key Points: ${s.snippet}
URL: ${s.url}
`).join('\n')}

Write a comprehensive literature review (minimum 1200 words) that:
- Reviews existing research
- Discusses key theories and concepts
- Identifies research gaps
- Synthesizes findings from multiple sources

Requirements:
- Continue naturally from the introduction
- Use academic language
- For citations, use the format [X] where X is the source number
- Each citation should be a clickable link to the source URL
- DO NOT include a references section
- DO NOT stop in the middle of a sentence`,

      // Research Methodology
      `Continue the research analysis about "${query}" by writing the methodology section. Here's what was covered in the literature review:

${previousContent}

Use these relevant sources for the methodology section:
${sourceGroups.methodology.map((s, idx) => `[${s.id}] ${s.title}
Key Points: ${s.snippet}
URL: ${s.url}
`).join('\n')}

Write a detailed methodology section (minimum 300 words) that:
- Describes research approach
- Explains data collection methods
- Details analysis techniques
- Justifies methodological choices

Requirements:
- Continue naturally from the literature review
- Use academic language
- For citations, use the format [X] where X is the source number
- Each citation should be a clickable link to the source URL
- DO NOT include a references section
- DO NOT stop in the middle of a sentence`,

      // Data Analysis
      `Continue the research analysis about "${query}" by writing the data analysis section. Here's what was covered in the methodology:

${previousContent}

Use these relevant sources for the data analysis:
${sourceGroups.analysis.map((s, idx) => `[${s.id}] ${s.title}
Key Points: ${s.snippet}
URL: ${s.url}
`).join('\n')}

Write a detailed data analysis section (minimum 200 words) that:
- Presents key findings
- Analyzes research results
- Interprets data patterns
- Discusses implications

Requirements:
- Continue naturally from the methodology section
- Use academic language
- For citations, use the format [X] where X is the source number
- Each citation should be a clickable link to the source URL
- DO NOT include a references section
- DO NOT stop in the middle of a sentence`,

      // Conclusion
      `Write the conclusion section of the research analysis about "${query}". Here's what was covered in the data analysis:

${previousContent}

Use these relevant sources for the conclusion:
${sourceGroups.conclusion.map((s, idx) => `[${s.id}] ${s.title}
Key Points: ${s.snippet}
URL: ${s.url}
`).join('\n')}

Write a conclusion section (minimum 100 words) that:
- Summarizes key findings
- Addresses research objectives
- Discusses implications
- Suggests future research

Requirements:
- Continue naturally from the data analysis section
- Use academic language
- For citations, use the format [X] where X is the source number
- Each citation should be a clickable link to the source URL
- DO NOT include a references section
- DO NOT stop in the middle of a sentence`
    ];

    // Generate each chunk
    for (let i = 0; i < prompts.length; i++) {
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          console.log(`Generating chunk ${i + 1}, attempt ${attempts + 1}`);
          
          const result = await geminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompts[i] }] }],
            generationConfig: {
              stopSequences: ["</div>", "Sources:", "References:", "Bibliography:"],
            }
          });

          if (!result.response.text()) {
            throw new Error(`Empty response for chunk ${i + 1}`);
          }

          const chunkContent = result.response.text();
          
          // Remove any references section if it exists
          const cleanedContent = chunkContent.split(/Sources:|References:|Bibliography:/i)[0].trim();
          
          const wordCount = cleanedContent.trim().split(/\s+/).length;

          // Validate minimum word count for each section
          const minWords = [200, 1200, 300, 200, 100][i];
          if (wordCount < minWords) {
            throw new Error(`Chunk ${i + 1} too short (${wordCount} words, minimum ${minWords} required)`);
          }

          allContent.push(cleanedContent);
          previousContent = cleanedContent; // Store for next chunk's context
          console.log(`Successfully generated chunk ${i + 1} with ${wordCount} words`);
          break;

        } catch (error) {
          attempts++;
          console.error(`Error generating chunk ${i + 1}, attempt ${attempts}:`, error);
          
          if (attempts === maxAttempts) {
            throw new Error(`Failed to generate chunk ${i + 1} after ${maxAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Combine chunks with section headers
    const fullContent = `# Introduction\n\n${allContent[0]}\n\n# Literature Review\n\n${allContent[1]}\n\n# Research Methodology\n\n${allContent[2]}\n\n# Data Analysis\n\n${allContent[3]}\n\n# Conclusion\n\n${allContent[4]}`;
    
    const totalWords = fullContent.trim().split(/\s+/).length;
    console.log(`Total content generated: ${totalWords} words`);

    // Validate minimum total length
    if (totalWords < 2000) {
      throw new Error(`Total content too short (${totalWords} words)`);
    }

    return fullContent;
  } catch (error) {
    console.error('Error generating research content:', error);
    throw new Error(`Research generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(request: Request) {
  try {
    const { messages, isDeepResearch } = await request.json();
    const query = messages[0].content;

    if (isDeepResearch) {
      // Deep Research Mode using Serper for sources and Gemini for content
      const sources = await fetchSerperSources(query);
      const content = await generateDeepResearch(query, sources);
      
      // Format content and calculate metadata
      const formattedContent = formatContentToHTML(content, sources, true);
      const wordCount = content.trim().split(/\s+/).length;
      
      return NextResponse.json({
        content: formattedContent,
        sources: sources.map((s, i) => ({
          id: String(i + 1),
          ...s
        })),
        metadata: {
          sourceCount: sources.length,
          citationsUsed: (content.match(/\[\d+\]/g) || []).length,
          sourceUsagePercent: Math.round((content.match(/\[\d+\]/g) || []).length / sources.length * 100),
          wordCount,
          model: 'gemini-2.0-flash'
        }
      });
    } else {
      // Normal Mode - Keep existing implementation
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
          .map((item, i) => {
            const favicon = getFavicon(item);
            return {
          id: (i + 1).toString(),
          title: item.title || '',
          url: item.link || '',
          snippet: item.snippet || '',
              favicon: favicon || undefined // Only include favicon if it exists
            };
          })
          .filter(source => source.url && source.title);

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
              
              if (result?.items && result.items.length > 0) {
                const newSources = result.items
                  .map((item, i) => ({
                    id: (sources.length + i + 1).toString(),
                    title: item.title || '',
                    url: item.link || '',
                    snippet: item.snippet || '',
                    favicon: getFavicon(item)
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
          
          if (backupResults?.items && backupResults.items.length > 0) {
            const backupSources = backupResults.items
              .map((item, i) => ({
                id: (sources.length + i + 1).toString(),
                title: item.title || '',
                url: item.link || '',
                snippet: item.snippet || '',
                favicon: getFavicon(item)
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
          const prompt = `Based on the following sources, write a focused research analysis about "${query}".

Sources:
${sources.map(s => `[${s.id}] ${s.title}\n${s.snippet}\n`).join('\n')}

Requirements:
- Target length: 1000 words minimum
- Structure the content as follows:
  1. Introduction (100 words, use 5% of sources)
  2. Main Analysis (600 words, use 60% of sources)
  3. Research Methods (150 words, use 15% of sources)
  4. Data Analysis (100 words, use 10% of sources)
  5. Conclusion (50 words, use 5% of sources)
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

          // Only check for minimum word count, allow any length above minimum
          if (content.trim().split(/\s+/).length < 900) {
            throw new Error('Generated content too short (minimum 900 words required)');
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
      const formattedContent = formatContentToHTML(content, sources, false);
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

        return NextResponse.json({
        content: formattedContent,
        sources,
        metadata
        });

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

        return NextResponse.json({
        error: errorMessage,
        details
        }, {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
        });
      }
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

    return NextResponse.json({
      error: errorMessage,
      details
    }, {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    });
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