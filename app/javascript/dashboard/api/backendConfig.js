const nodeBackendUrl = import.meta.env.VITE_NODE_BACKEND_URL || '';
const nodeBackendResources = (import.meta.env.VITE_NODE_BACKEND_RESOURCES || '')
  .split(',')
  .map(resource => resource.trim())
  .filter(Boolean);

export function usesNodeBackend(resource) {
  return nodeBackendResources.includes(resource);
}

export function nodeApiUrl(path) {
  return `${nodeBackendUrl.replace(/\/$/, '')}${path}`;
}
