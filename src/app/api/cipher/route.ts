import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

const googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export const runtime = 'edge'
export const maxDuration = 30

interface Source {
  id: string;
  title: string;
  url: string;
  snippet?: string;
}

function cleanContent(content: string): string {
  return content.replace(/^```html\s*|\s*```$/g, '').trim()
}

function extractSources(content: string): Source[] {
  const sources: Source[] = []
  const citations = content.match(/\[(\d+)\]/g) || []
  const uniqueCitations = [...new Set(citations.map(c => c.replace(/[\[\]]/g, '')))]
  
  return uniqueCitations.map(id => ({
    id,
    title: '', // These will be populated from the sources panel
    url: ''
  }))
}

function cleanJsonResponse(response: string): string {
  // Remove markdown code block syntax and any surrounding whitespace
  return response
    .replace(/^```(?:json)?\s*/, '') // Remove opening code block
    .replace(/\s*```$/, '')          // Remove closing code block
    .trim();
}

export async function POST(request: Request) {
  try {
    const { request: userRequest, currentContent } = await request.json()

    if (!userRequest?.trim()) {
      return NextResponse.json(
        { error: 'Please provide a valid edit request' },
        { status: 400 }
      )
    }

    if (!currentContent?.trim()) {
      return NextResponse.json(
        { error: 'No content provided to edit' },
        { status: 400 }
      )
    }

    // Extract existing sources and their IDs
    const existingSources = extractSources(currentContent)
    const availableIds = existingSources.map(s => s.id).join(', ')

    const prompt = `You are Cipher, an expert content editor. Your task is to make the exact edit requested by the user.

Current content:
${currentContent}

Available citations: [${availableIds}]

User's request: ${userRequest}

Return a JSON response in this EXACT format, with the full content properly escaped:
{
  "editedContent": "full content with your edit"
}

IMPORTANT:
- Return valid JSON with properly escaped content
- Make ONLY the specific change requested
- Keep all other content exactly the same
- Use only existing citations [${availableIds}]`

    // Add timeout to the Gemini API call
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 second timeout

    try {
      const model = googleAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096, // Reduced from 8192
          topK: 1,
          topP: 0.1,
        }
      })

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          stopSequences: ["</div>"],
        }
      }, { signal: controller.signal })

      clearTimeout(timeoutId)

      let response = result.response.text()
      if (!response) {
        throw new Error('Empty response from AI')
      }

      // Clean up the response and ensure valid JSON
      let cleanedResponse = cleanJsonResponse(response).replace(/[\x00-\x1F]+/g, ' ')
      
      try {
        const edit = JSON.parse(cleanedResponse)
        if (edit?.editedContent) {
          return processEdit(edit.editedContent, existingSources)
        }
        throw new Error('Invalid response structure')
      } catch (parseError) {
        console.error('JSON parse error:', parseError)
        return NextResponse.json(
          { error: 'Failed to process the edit. Please try again.' },
          { status: 500 }
        )
      }

    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timed out. Please try again.' },
          { status: 504 }
        )
      }
      throw error
    }

  } catch (error: any) {
    console.error('Cipher error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'An unexpected error occurred',
        details: error.stack
      },
      { status: error.status || 500 }
    )
  }
}

// Helper function to process the edit
function processEdit(editedContent: string, existingSources: any[]) {
  try {
    // Verify no invalid citations were introduced
    const newSources = extractSources(editedContent)
    const invalidSources = newSources.filter(s => 
      !existingSources.some(es => es.id === s.id)
    )
    
    if (invalidSources.length > 0) {
      return NextResponse.json(
        { error: `Invalid citations used: [${invalidSources.map(s => s.id).join(', ')}]` },
        { status: 400 }
      )
    }

    // Format citations in the edited content
    const formattedContent = editedContent.replace(/\[(\d+)\]/g, (match, id) => {
      return `<a href="#" class="citation" data-preview="Source ${id}" title="Source ${id}">[${id}]</a>`
    })

    // Calculate updated metadata
    const citations = formattedContent.match(/\[(\d+)\]/g) || []
    const uniqueCitations = new Set(citations.map(c => c.replace(/[\[\]]/g, '')))
    const metadata = {
      citationsUsed: uniqueCitations.size,
      sourceUsagePercent: Math.round((uniqueCitations.size / existingSources.length) * 100)
    }

    return NextResponse.json({ 
      editedContent: formattedContent,
      metadata
    })
  } catch (error) {
    console.error('Process edit error:', error)
    return NextResponse.json(
      { error: 'Failed to process the edit. Please try again.' },
      { status: 500 }
    )
  }
} 