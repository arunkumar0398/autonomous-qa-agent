import type { FrameworkSignal, RepoSnapshot } from '../types/domain.js';

interface FrameworkSignature {
  dependencies: string[];
  filePatterns: RegExp[];
}

const FRAMEWORK_SIGNATURES: Record<'react' | 'vue' | 'angular', FrameworkSignature> = {
  react: {
    dependencies: ['react', 'next'],
    filePatterns: [/\.jsx$/i, /\.tsx$/i, /src\/components\//i]
  },
  vue: {
    dependencies: ['vue', 'nuxt'],
    filePatterns: [/\.vue$/i]
  },
  angular: {
    dependencies: ['@angular/core'],
    filePatterns: [/angular\.json$/i, /\.component\.ts$/i]
  }
};

function hasMatchingDependency(dependencies: string[], signatures: string[]): boolean {
  return dependencies.some((dep) => signatures.some((signature) => dep === signature || dep.startsWith(`${signature}/`)));
}

function hasMatchingFile(files: string[], patterns: RegExp[]): boolean {
  return files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

export function detectFrameworks(snapshot: Partial<RepoSnapshot> = {}): FrameworkSignal[] {
  const files = Array.isArray(snapshot.files) ? snapshot.files : [];
  const dependencies = Array.isArray(snapshot.dependencies) ? snapshot.dependencies : [];

  const detected: FrameworkSignal[] = [];

  for (const [framework, signature] of Object.entries(FRAMEWORK_SIGNATURES) as Array<[FrameworkSignal['framework'], FrameworkSignature]>) {
    const depMatch = hasMatchingDependency(dependencies, signature.dependencies);
    const fileMatch = hasMatchingFile(files, signature.filePatterns);

    if (!depMatch && !fileMatch) {
      continue;
    }

    detected.push({
      framework,
      confidence: depMatch && fileMatch ? 0.92 : 0.74,
      signals: {
        dependency: depMatch,
        files: fileMatch
      }
    });
  }

  return detected;
}
