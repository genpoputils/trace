import {
  ProjectAnalysis,
  SearchResult,
  SearchQuery,
} from '../types/trace';

export class SearchService {
  constructor(private analysis: ProjectAnalysis) {}

  public search(query: SearchQuery): SearchResult[] {
    const term = (query.term || '').trim().toLowerCase();
    if (!term) return [];

    const results: SearchResult[] = [];
    const limit = query.limit || 30;

    for (const entity of Object.values(this.analysis.entities)) {
      // Filter by entity kind if provided
      if (query.kinds && query.kinds.length > 0 && !query.kinds.includes(entity.kind)) {
        continue;
      }

      // Filter by file pattern if provided
      if (query.filePattern && !entity.filePath.toLowerCase().includes(query.filePattern.toLowerCase())) {
        continue;
      }

      const nameLower = entity.name.toLowerCase();
      const pathLower = entity.filePath.toLowerCase();
      const matches: SearchResult['matches'] = [];
      let score = 0;

      // Exact name match
      if (nameLower === term) {
        score += 100;
        matches.push({ field: 'name', snippet: entity.name });
      } else if (nameLower.startsWith(term)) {
        score += 60;
        matches.push({ field: 'name', snippet: entity.name });
      } else if (nameLower.includes(term)) {
        score += 40;
        matches.push({ field: 'name', snippet: entity.name });
      }

      // Path match
      if (pathLower.includes(term)) {
        score += 20;
        matches.push({ field: 'filePath', snippet: entity.filePath });
      }

      // Route path or method match
      if (entity.metadata?.routePath && String(entity.metadata.routePath).toLowerCase().includes(term)) {
        score += 50;
        matches.push({ field: 'routePath', snippet: String(entity.metadata.routePath) });
      }

      // Snippet match
      if (entity.snippet && entity.snippet.toLowerCase().includes(term)) {
        score += 15;
        const line = entity.snippet.split('\n').find((l) => l.toLowerCase().includes(term));
        if (line) {
          matches.push({ field: 'code', snippet: line.trim() });
        }
      }

      if (score > 0) {
        results.push({ entity, matches, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
