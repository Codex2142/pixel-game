import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  console.error('Error: dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

// Add .nojekyll so GitHub Pages serves all files cleanly
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');

console.log('Creating/updating local gh-pages branch from dist/...');
execSync('git add dist -f');
try {
  const treeHash = execSync('git write-tree --prefix=dist/', { encoding: 'utf8' }).trim();
  const commitHash = execSync(
    `git commit-tree ${treeHash} -m "deploy: build production bundle for GitHub Pages"`,
    { encoding: 'utf8' }
  ).trim();
  execSync(`git update-ref refs/heads/gh-pages ${commitHash}`);
  console.log(`Updated local branch "gh-pages" -> ${commitHash}`);
} finally {
  execSync('git reset dist');
}

if (!process.argv.includes('--local-only')) {
  console.log('Pushing gh-pages branch to origin...');
  execSync('git push -f origin gh-pages:gh-pages', { stdio: 'inherit' });
  console.log('Successfully deployed to origin/gh-pages!');
}
