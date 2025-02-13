import { GoogleGenerativeAI } from '@google/generative-ai';

const googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function generateFeedback({
  query,
  numQuestions = 3,
}: {
  query: string;
  numQuestions?: number;
}): Promise<string[]> {
  const model = googleAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      topK: 40,
      topP: 0.9,
    }
  });

  const prompt = `Given the following query from the user, ask some follow up questions to clarify the research direction. Return a maximum of ${numQuestions} questions, but feel free to return less if the original query is clear: <query>${query}</query>

  Return the response in the following JSON format:
  {
    "questions": ["question 1", "question 2", "question 3"]
  }`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  
  try {
    const parsedResponse = JSON.parse(response);
    return parsedResponse.questions.slice(0, numQuestions);
  } catch (error) {
    console.error('Failed to parse response:', error);
    return [];
  }
}
