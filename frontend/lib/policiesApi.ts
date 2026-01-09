// Policy API client
import { api } from './api';

export interface PolicyMetadata {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  countryScope: string[];
  latestPublishedVersion: number;
  summary: string;
  publishedAt: string;
}

export interface PolicyContent {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  countryScope: string[];
  version: number;
  publishedAt: string;
  summary: string;
  content: string;
}

export interface PolicyVersion {
  version: number;
  status: 'draft' | 'published';
  title: string;
  summary?: string;
  content: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const policiesAPI = {
  listPublished: () => api.get('/policies'),
  getPolicy: (slug: string) => api.get(`/policies/${slug}`),
  getVersions: (slug: string) => api.get(`/policies/${slug}/versions`),
  createVersion: (slug: string, data: { title?: string; summary?: string; content: string; publish?: boolean }) =>
    api.post(`/policies/${slug}/version`, data),
  publishVersion: (slug: string, version: number) => api.post(`/policies/${slug}/publish`, { version }),
  acceptPolicies: (slugs: string[], meta?: any) => api.post('/policies/accept', { slugs, meta }),
  seedDefaults: () => api.post('/policies/seed/defaults'),
};
