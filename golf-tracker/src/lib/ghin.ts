import { GhinClient } from 'ghin';

let clientCache: { client: GhinClient; username: string } | null = null;

export function getGhinClient(username: string, password: string): GhinClient {
  if (clientCache && clientCache.username === username) {
    return clientCache.client;
  }

  const client = new GhinClient({ username, password });
  clientCache = { client, username };
  return client;
}
