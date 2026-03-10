// Topic Memory — tracks past content topics to build authority clusters
// Persisted in localStorage for session-independent tracking

export interface TopicEntry {
  id: string;
  topic: string;
  keywords: string[];
  angle: string;
  audience: string;
  createdAt: string;
  formats: string[];
}

export interface AuthorityCluster {
  name: string;
  count: number;
  topics: string[];
  keywords: string[];
  lastUsed: string;
}

const STORAGE_KEY = "linkedin-strategist-topic-memory";

function getEntries(): TopicEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: TopicEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function addTopicEntry(entry: Omit<TopicEntry, "id" | "createdAt">): TopicEntry {
  const entries = getEntries();
  const newEntry: TopicEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  entries.unshift(newEntry);
  // Keep last 50 entries
  saveEntries(entries.slice(0, 50));
  return newEntry;
}

export function getTopicHistory(): TopicEntry[] {
  return getEntries();
}

export function clearTopicHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAuthorityClusters(): AuthorityCluster[] {
  const entries = getEntries();
  const clusterMap = new Map<string, { topics: Set<string>; keywords: Set<string>; count: number; lastUsed: string }>();

  for (const entry of entries) {
    // Use keywords to group into clusters
    for (const kw of entry.keywords) {
      const normalizedKw = kw.toLowerCase().trim();
      if (normalizedKw.length < 3) continue;

      const existing = clusterMap.get(normalizedKw);
      if (existing) {
        existing.topics.add(entry.topic);
        entry.keywords.forEach((k) => existing.keywords.add(k));
        existing.count++;
        if (entry.createdAt > existing.lastUsed) existing.lastUsed = entry.createdAt;
      } else {
        clusterMap.set(normalizedKw, {
          topics: new Set([entry.topic]),
          keywords: new Set(entry.keywords),
          count: 1,
          lastUsed: entry.createdAt,
        });
      }
    }
  }

  // Merge overlapping clusters and return top ones
  const clusters: AuthorityCluster[] = [];
  const visited = new Set<string>();

  const sortedKeys = [...clusterMap.entries()].sort((a, b) => b[1].count - a[1].count);

  for (const [key, data] of sortedKeys) {
    if (visited.has(key)) continue;
    visited.add(key);

    // Merge similar clusters
    for (const [otherKey, otherData] of clusterMap.entries()) {
      if (visited.has(otherKey)) continue;
      const overlap = [...data.topics].filter((t) => otherData.topics.has(t));
      if (overlap.length > 0) {
        otherData.topics.forEach((t) => data.topics.add(t));
        otherData.keywords.forEach((k) => data.keywords.add(k));
        data.count += otherData.count;
        visited.add(otherKey);
      }
    }

    if (data.count >= 1) {
      clusters.push({
        name: key,
        count: data.count,
        topics: [...data.topics],
        keywords: [...data.keywords].slice(0, 8),
        lastUsed: data.lastUsed,
      });
    }
  }

  return clusters.sort((a, b) => b.count - a.count).slice(0, 10);
}
