#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { GoogleAuth } from 'google-auth-library';

const root = path.resolve(import.meta.dirname, '..');
const projectId = process.argv.find(arg => arg.startsWith('--project='))?.slice('--project='.length)
  || process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT;
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!projectId) throw new Error('Missing --project=<firebase-project-id>.');
if (!keyFile || !fs.existsSync(keyFile)) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a service-account JSON file.');
}

const auth = new GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const accessToken = await client.getAccessToken();
if (!accessToken.token) throw new Error('Unable to obtain a Google access token.');

async function api(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload?.error?.details ? JSON.stringify(payload.error.details) : '';
    throw new Error(`${payload?.error?.message || response.statusText}${details ? `\n${details}` : ''}`);
  }
  return payload;
}

const content = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const ruleset = await api(
  'POST',
  `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/rulesets`,
  { source: { files: [{ name: 'firestore.rules', content }] } },
);

if (!ruleset.name) throw new Error('Rules API did not return a ruleset name.');
const releaseName = `projects/${projectId}/releases/cloud.firestore`;
await api(
  'PATCH',
  `https://firebaserules.googleapis.com/v1/${releaseName}`,
  { release: { name: releaseName, rulesetName: ruleset.name } },
);

console.log(`Firestore rules compiled and deployed: ${ruleset.name}`);
