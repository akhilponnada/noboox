import OpenAI from 'openai'
import { OpenAIStream, StreamingTextResponse } from 'ai'

// Create an OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge'

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json()

  // Ask OpenAI for a streaming chat completion given the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    })),
  })

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response)

  // Respond with the stream
  return new StreamingTextResponse(stream)
} 