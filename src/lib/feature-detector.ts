import type { ChangeMeta, UiFeature } from '../types/domain.js';

const UI_PATTERNS: Record<string, RegExp> = {
  button: /(button|btn|submit)/i,
  input: /(input|textfield|form|search)/i,
  dropdown: /(select|dropdown|menu)/i,
  modal: /(modal|dialog)/i,
  table: /(table|grid|list)/i
};

function classifyElement(elementName: string): string {
  for (const [type, pattern] of Object.entries(UI_PATTERNS)) {
    if (pattern.test(elementName)) {
      return type;
    }
  }
  return 'generic';
}

function toFeatureId(pathOrName: string): string {
  return pathOrName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function detectUiFeatures(snapshot: { files?: string[] } = {}): UiFeature[] {
  const files = Array.isArray(snapshot.files) ? snapshot.files : [];
  const candidateFiles = files.filter((file) => /components|pages|views|screens/i.test(file));

  return candidateFiles.map((file) => {
    const fileName = file.split('/').at(-1) ?? file;
    return {
      featureId: toFeatureId(file),
      source: file,
      category: classifyElement(fileName)
    };
  });
}

export function detectBugFixIntent(change: ChangeMeta = {}): { detected: boolean; reason: string } {
  const title = change.title ?? '';
  const branch = change.branch ?? '';
  const labels = Array.isArray(change.labels) ? change.labels : [];

  const isFix = /(fix|bug|hotfix|patch|regression)/i.test(title) || /(fix|hotfix|bug)/i.test(branch) || labels.some((item) => /(bug|fix|incident)/i.test(item));

  return {
    detected: isFix,
    reason: isFix ? 'fix-signal-from-metadata' : 'no-fix-signal'
  };
}
