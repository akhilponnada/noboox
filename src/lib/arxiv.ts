import { XMLParser } from 'fast-xml-parser';

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  doi?: string;
  comment?: string;
  primaryCategory: string;
  categories: string[];
  links: {
    abstract: string;
    pdf?: string;
    doi?: string;
  };
}

interface ArxivResponse {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  entries: ArxivEntry[];
}

export class ArxivClient {
  private parser: XMLParser;
  private baseUrl = 'http://export.arxiv.org/api/query';

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  private parseEntry(entry: any): ArxivEntry {
    // Extract links
    const links: { abstract: string; pdf?: string; doi?: string } = {
      abstract: '',
    };

    if (Array.isArray(entry.link)) {
      entry.link.forEach((link: any) => {
        if (link['@_rel'] === 'alternate') {
          links.abstract = link['@_href'];
        } else if (link['@_title'] === 'pdf') {
          links.pdf = link['@_href'];
        } else if (link['@_title'] === 'doi') {
          links.doi = link['@_href'];
        }
      });
    } else if (entry.link) {
      // Handle single link case
      const link = entry.link;
      if (link['@_rel'] === 'alternate') {
        links.abstract = link['@_href'];
      } else if (link['@_title'] === 'pdf') {
        links.pdf = link['@_href'];
      } else if (link['@_title'] === 'doi') {
        links.doi = link['@_href'];
      }
    }

    // Extract authors
    const authors = Array.isArray(entry.author)
      ? entry.author.map((author: any) => author.name)
      : entry.author ? [entry.author.name] : [];

    // Extract categories
    let categories: string[] = [];
    let primaryCategory = '';

    if (entry.category) {
      if (Array.isArray(entry.category)) {
        categories = entry.category.map((cat: any) => cat['@_term']);
      } else {
        categories = [entry.category['@_term']];
      }
    }

    if (entry['arxiv:primary_category']) {
      primaryCategory = entry['arxiv:primary_category']['@_term'];
    } else if (categories.length > 0) {
      primaryCategory = categories[0];
    }

    // Clean and validate ID
    const idParts = entry.id.split('/abs/');
    const id = idParts.length > 1 ? idParts[1] : entry.id;

    return {
      id,
      title: entry.title?.trim() || '',
      summary: entry.summary?.trim() || '',
      authors,
      published: entry.published || '',
      updated: entry.updated || entry.published || '',
      doi: entry['arxiv:doi'],
      comment: entry['arxiv:comment'],
      primaryCategory,
      categories,
      links,
    };
  }

  private buildSearchQuery(query: string): string {
    // Extract key concepts and synonyms
    const concepts = {
      'machine learning': ['machine learning', 'deep learning', 'artificial intelligence', 'AI', 'ML', 'neural network'],
      'hospital': ['hospital', 'healthcare', 'medical', 'clinical', 'NHS', 'patient'],
      'united kingdom': ['UK', 'United Kingdom', 'Britain', 'England', 'NHS'],
    };

    // Build concept-based query
    let searchParts = [];

    // Add main concepts with synonyms
    for (const [concept, synonyms] of Object.entries(concepts)) {
      if (query.toLowerCase().includes(concept)) {
        const synonymQuery = synonyms
          .map(term => `(ti:"${term}" OR abs:"${term}" OR all:${term})`)
          .join('+OR+');
        searchParts.push(`(${synonymQuery})`);
      }
    }

    // Add any remaining terms from the original query
    const originalTerms = query.split(' ')
      .filter(term => term.length > 2)
      .filter(term => !Object.keys(concepts).some(concept => 
        term.toLowerCase().includes(concept.toLowerCase())
      ))
      .map(term => {
        const cleanTerm = term.replace(/[^\w\s]/g, '').trim();
        return `(ti:${cleanTerm} OR abs:${cleanTerm} OR all:${cleanTerm})`;
      });

    if (originalTerms.length > 0) {
      searchParts.push(`(${originalTerms.join('+OR+')})`);
    }

    // Combine all parts with AND
    const finalQuery = searchParts.join('+AND+');

    // If no valid parts, use a broader fallback query
    if (!finalQuery) {
      return 'cat:cs.AI+OR+cat:cs.LG+OR+cat:stat.ML';
    }

    return finalQuery;
  }

  async search(query: string, start = 0, maxResults = 10): Promise<ArxivResponse> {
    try {
      // Try first with the concept-based search
      const searchQuery = this.buildSearchQuery(query);
      let response = await this.performSearch(searchQuery, start, maxResults);

      // If no results, try with category-based search
      if (response.entries.length === 0) {
        const categoryQuery = 'cat:cs.AI+OR+cat:cs.LG+OR+cat:stat.ML';
        const broadTerms = query.split(' ')
          .filter(term => term.length > 3)
          .map(term => term.replace(/[^\w\s]/g, ''))
          .filter(term => term)
          .map(term => `all:${term}`)
          .join('+OR+');

        if (broadTerms) {
          response = await this.performSearch(`(${categoryQuery})+AND+(${broadTerms})`, start, maxResults);
        } else {
          response = await this.performSearch(categoryQuery, start, maxResults);
        }
      }

      return response;
    } catch (error) {
      console.error('ArXiv API error:', error);
      return {
        totalResults: 0,
        startIndex: start,
        itemsPerPage: maxResults,
        entries: [],
      };
    }
  }

  private async performSearch(searchQuery: string, start: number, maxResults: number): Promise<ArxivResponse> {
    const params = new URLSearchParams({
      search_query: searchQuery,
      start: start.toString(),
      max_results: maxResults.toString(),
      sortBy: 'relevance',
      sortOrder: 'descending',
    });

    const response = await fetch(`${this.baseUrl}?${params}`);
    if (!response.ok) {
      throw new Error('Failed to fetch from arXiv API');
    }

    const xml = await response.text();
    const result = this.parser.parse(xml);
    const feed = result.feed;

    if (!feed) {
      return {
        totalResults: 0,
        startIndex: start,
        itemsPerPage: maxResults,
        entries: [],
      };
    }

    return {
      totalResults: parseInt(feed['opensearch:totalResults']) || 0,
      startIndex: parseInt(feed['opensearch:startIndex']) || start,
      itemsPerPage: parseInt(feed['opensearch:itemsPerPage']) || maxResults,
      entries: feed.entry 
        ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry])
            .map((entry: any) => this.parseEntry(entry))
            .filter((entry: ArxivEntry) => 
              entry.title && 
              entry.links.abstract && 
              entry.summary && 
              entry.summary.length > 100
            )
        : [],
    };
  }
}

export const arxivClient = new ArxivClient(); 