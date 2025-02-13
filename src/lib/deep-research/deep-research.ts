import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';

import { o3MiniModel, trimPrompt } from './ai/providers';
import { systemPrompt } from './prompt';
import { OutputManager } from './output-manager';

const googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Initialize output manager for coordinated console/progress output
const output = new OutputManager();

// Replace console.log with output.log
function log(...args: any[]) {
  output.log(...args);
}

export type ResearchProgress = {
  currentDepth: number;
  totalDepth: number;
  currentBreadth: number;
  totalBreadth: number;
  currentQuery?: string;
  totalQueries: number;
  completedQueries: number;
};

type ResearchResult = {
  learnings: string[];
  visitedUrls: string[];
};

// increase this if you have higher API rate limits
const ConcurrencyLimit = 2;

// Initialize Firecrawl with optional API key and optional base url
const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});

interface SerpQuery {
  query: string;
  researchGoal: string;
}

// take en user query, return a list of SERP queries
async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
}: {
  query: string;
  numQueries?: number;
  learnings?: string[];
}): Promise<SerpQuery[]> {
  const model = googleAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      topK: 40,
      topP: 0.9,
    }
  });

  const prompt = `Given the following prompt from the user, generate a list of SERP queries to research the topic. Return a maximum of ${numQueries} queries, but feel free to return less if the original prompt is clear. Make sure each query is unique and not similar to each other: <prompt>${query}</prompt>\n\n${
    learnings
      ? `Here are some learnings from previous research, use them to generate more specific queries: ${learnings.join(
          '\n',
        )}`
      : ''
  }

  Return the response in the following JSON format:
  {
    "queries": [
      {
        "query": "the search query",
        "researchGoal": "detailed explanation of the goal and additional research directions"
      }
    ]
  }`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  
  try {
    const parsedResponse = JSON.parse(response);
    log(
      `Created ${parsedResponse.queries.length} queries`,
      parsedResponse.queries,
    );
    return parsedResponse.queries.slice(0, numQueries) as SerpQuery[];
  } catch (error) {
    console.error('Failed to parse response:', error);
    return [];
  }
}

async function processSerpResult({
  query,
  searchResult,
  numLearnings = 3,
  numFollowUpQuestions = 3,
}: {
  query: string;
  searchResult: SearchResponse;
  numLearnings?: number;
  numFollowUpQuestions?: number;
}) {
  const contents = compact(searchResult.data.map(item => item.markdown));
  log(`Ran ${query}, found ${contents.length} contents`);

  const model = googleAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      topK: 40,
      topP: 0.9,
    }
  });

  const prompt = `Given the following contents from a SERP search for the query <query>${query}</query>, generate a list of learnings from the contents. Return a maximum of ${numLearnings} learnings, but feel free to return less if the contents are clear. Make sure each learning is unique and not similar to each other. The learnings should be concise and to the point, as detailed and information dense as possible. Make sure to include any entities like people, places, companies, products, things, etc in the learnings, as well as any exact metrics, numbers, or dates. The learnings will be used to research the topic further.\n\n<contents>${contents
    .map(content => `<content>\n${content}\n</content>`)
    .join('\n')}</contents>

  Return the response in the following JSON format:
  {
    "learnings": ["learning 1", "learning 2", "learning 3"],
    "followUpQuestions": ["question 1", "question 2", "question 3"]
  }`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  
  try {
    const parsedResponse = JSON.parse(response);
    log(
      `Created ${parsedResponse.learnings.length} learnings`,
      parsedResponse.learnings,
    );
    return parsedResponse;
  } catch (error) {
    console.error('Failed to parse response:', error);
    return { learnings: [], followUpQuestions: [] };
  }
}

export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
}: {
  prompt: string;
  learnings: string[];
  visitedUrls: string[];
}) {
  const model = googleAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 16384,
      topK: 40,
      topP: 0.9,
    }
  });

  const promptText = `Given the following prompt from the user, write a final report on the topic using the learnings from research. Make it as as detailed as possible, aim for 3 or more pages, include ALL the learnings from research:\n\n<prompt>${prompt}</prompt>\n\nHere are all the learnings from previous research:\n\n<learnings>\n${learnings.join('\n')}\n</learnings>

  Return the response in the following JSON format:
  {
    "reportMarkdown": "the final report in markdown format"
  }`;

  const result = await model.generateContent(promptText);
  const response = result.response.text();
  
  try {
    const parsedResponse = JSON.parse(response);
    // Append the visited URLs section to the report
    const urlsSection = `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
    return parsedResponse.reportMarkdown + urlsSection;
  } catch (error) {
    console.error('Failed to parse response:', error);
    return '';
  }
}

export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
  onProgress,
}: {
  query: string;
  breadth: number;
  depth: number;
  learnings?: string[];
  visitedUrls?: string[];
  onProgress?: (progress: ResearchProgress) => void;
}): Promise<ResearchResult> {
  const progress: ResearchProgress = {
    currentDepth: depth,
    totalDepth: depth,
    currentBreadth: breadth,
    totalBreadth: breadth,
    totalQueries: 0,
    completedQueries: 0,
  };
  
  const reportProgress = (update: Partial<ResearchProgress>) => {
    Object.assign(progress, update);
    onProgress?.(progress);
  };

  const serpQueries = await generateSerpQueries({
    query,
    learnings,
    numQueries: breadth,
  });
  
  reportProgress({
    totalQueries: serpQueries.length,
    currentQuery: serpQueries[0]?.query
  });
  
  const limit = pLimit(ConcurrencyLimit);

  const results = await Promise.all(
    serpQueries.map((serpQuery: SerpQuery) =>
      limit(async () => {
        try {
          const result = await firecrawl.search(serpQuery.query, {
            timeout: 15000,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          });

          // Collect URLs from this search
          const newUrls = compact(result.data.map(item => item.url));
          const newBreadth = Math.ceil(breadth / 2);
          const newDepth = depth - 1;

          const newLearnings = await processSerpResult({
            query: serpQuery.query,
            searchResult: result,
            numFollowUpQuestions: newBreadth,
          });
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];

          if (newDepth > 0) {
            log(
              `Researching deeper, breadth: ${newBreadth}, depth: ${newDepth}`,
            );

            reportProgress({
              currentDepth: newDepth,
              currentBreadth: newBreadth,
              completedQueries: progress.completedQueries + 1,
              currentQuery: serpQuery.query,
            });

            const nextQuery = `
            Previous research goal: ${serpQuery.researchGoal}
            Follow-up research directions: ${newLearnings.followUpQuestions.map((q: string) => `\n${q}`).join('')}
          `.trim();

            return deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
              onProgress,
            });
          }

          return {
            learnings: allLearnings,
            visitedUrls: allUrls,
          };
        } catch (error) {
          console.error('Error during research:', error);
          return {
            learnings,
            visitedUrls,
          };
        }
      })
    )
  );

  // Combine all results
  const finalResult = results.reduce(
    (acc, result) => ({
      learnings: [...acc.learnings, ...result.learnings],
      visitedUrls: [...acc.visitedUrls, ...result.visitedUrls],
    }),
    { learnings: [], visitedUrls: [] } as ResearchResult
  );

  return finalResult;
}
