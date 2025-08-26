// External search utilities for NCBI PubMed and OpenAlex
import * as logger from 'firebase-functions/logger';

// A helper to format search results
const formatResults = (articles: { title: string; abstract: string }[], source: string): string => {
  if (articles.length === 0) {
    return `No relevant articles found from ${source}.`;
  }
  return articles
    .map((article, index) => `[${source} Article ${index + 1}]\nTitle: ${article.title}\nAbstract: ${article.abstract}`)
    .join('\n\n');
};

// OpenAlex provides abstracts in an inverted index format, we need to reconstruct it.
const invertAbstract = (invertedIndex: { [key: string]: number[] }): string => {
  const wordPositions: { [key: number]: string } = {};
  for (const word in invertedIndex) {
    for (const position of invertedIndex[word]) {
      wordPositions[position] = word;
    }
  }

  const abstractArray = [];
  const sortedPositions = Object.keys(wordPositions).map(Number).sort((a, b) => a - b);
  for (const position of sortedPositions) {
    abstractArray.push(wordPositions[position]);
  }
  
  let abstract = abstractArray.join(' ');
  // Truncate for brevity to avoid overly long prompts
  if (abstract.length > 500) {
      abstract = abstract.substring(0, 500) + '...';
  }
  return abstract;
};

export const searchNCBI = async (topic: string): Promise<string> => {
  try {
    logger.info(`Starting NCBI search for topic: ${topic}`);
    
    // NCBI requires a tool name and email for API access compliance
    const email = "dermatology-qgen@example.com"; 
    const tool = "dermatology-qgen-app";
    const searchBase = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
    const summaryBase = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

    // 1. Search for up to 3 relevant article IDs from PubMed
    const searchUrl = `${searchBase}?db=pubmed&term=${encodeURIComponent(topic)}[Title/Abstract]&retmode=json&retmax=3&sort=relevance&tool=${tool}&email=${email}`;
    logger.info(`NCBI search URL: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) throw new Error(`NCBI search failed with status: ${searchResponse.status}`);
    const searchData = await searchResponse.json() as any;
    const ids = searchData.esearchresult?.idlist;

    if (!ids || ids.length === 0) {
      logger.info('No NCBI articles found for topic');
      return 'No articles found on NCBI for this topic.';
    }

    logger.info(`Found ${ids.length} NCBI articles`);

    // 2. Fetch summaries (which include titles) for those IDs
    const idString = ids.join(',');
    const summaryUrl = `${summaryBase}?db=pubmed&id=${idString}&retmode=json&tool=${tool}&email=${email}`;
    const summaryResponse = await fetch(summaryUrl);
    if (!summaryResponse.ok) throw new Error(`NCBI summary fetch failed with status: ${summaryResponse.status}`);
    const summaryData = await summaryResponse.json() as any;
    
    const articles = ids.map((id: string) => {
        const result = summaryData.result[id];
        return {
            title: result.title || 'No title available',
            // ESummary does not provide abstracts, so we note that. Titles provide sufficient context for the summarizer.
            abstract: 'Abstract not available in summary view.'
        };
    });

    const result = formatResults(articles, 'NCBI');
    logger.info(`NCBI search completed successfully`);
    return result;
  } catch (error) {
    logger.error('NCBI Search Error:', error);
    return 'Failed to fetch data from NCBI. The service may be temporarily unavailable.';
  }
};

export const searchOpenAlex = async (topic: string): Promise<string> => {
  try {
    logger.info(`Starting OpenAlex search for topic: ${topic}`);
    
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(topic)}&per-page=3&sort=relevance_score:desc&filter=has_abstract:true`;
    logger.info(`OpenAlex search URL: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenAlex search failed with status: ${response.status}`);
    const data = await response.json() as any;

    if (!data.results || data.results.length === 0) {
      logger.info('No OpenAlex articles found for topic');
      return 'No articles found on OpenAlex for this topic.';
    }

    logger.info(`Found ${data.results.length} OpenAlex articles`);

    const articles = data.results.map((item: any) => ({
      title: item.title || 'No title available',
      abstract: item.abstract_inverted_index ? invertAbstract(item.abstract_inverted_index) : 'No abstract available.'
    }));

    const result = formatResults(articles, 'OpenAlex');
    logger.info(`OpenAlex search completed successfully`);
    return result;
  } catch (error) {
    logger.error('OpenAlex Search Error:', error);
    return 'Failed to fetch data from OpenAlex. The service may be temporarily unavailable.';
  }
};