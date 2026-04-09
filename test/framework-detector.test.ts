import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFrameworks } from '../src/lib/framework-detector.js';

test('detectFrameworks identifies React, Vue, and Angular signals', () => {
  const detected = detectFrameworks({
    files: ['src/components/App.jsx', 'src/views/Home.vue', 'angular.json'],
    dependencies: ['react', 'vue', '@angular/core']
  });

  const names = detected.map((item) => item.framework);
  assert.equal(names.includes('react'), true);
  assert.equal(names.includes('vue'), true);
  assert.equal(names.includes('angular'), true);
});
