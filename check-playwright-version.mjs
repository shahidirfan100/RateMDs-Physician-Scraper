// check-playwright-version.mjs
import { readFileSync } from 'fs';

try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const playwrightVersion = packageJson.dependencies?.playwright;

    if (!playwrightVersion) {
        console.error('❌ Playwright not found in package.json dependencies');
        process.exit(1);
    }

    // Extract version number (remove ^ or ~ prefixes)
    const version = playwrightVersion.replace(/^[^\d]*/, '');

    console.log(`✅ Playwright version in package.json: ${version}`);

    // You could add more validation here if needed
    // For example, check if it matches the Docker image version

} catch (error) {
    console.error('❌ Error checking Playwright version:', error.message);
    process.exit(1);
}