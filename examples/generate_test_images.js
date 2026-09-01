#!/usr/bin/env node
// Generate and save test images from progressive test suite

const fs = require('fs');
const path = require('path');

// Create output directory
const outputDir = './test_images_output';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Generating test images from Go test suite...');
console.log('Output directory:', path.resolve(outputDir));

// Run Go tests with image generation
const { execSync } = require('child_process');

try {
    // Run tests and capture temp directory paths
    const result = execSync('go test ./automation -v -run TestLevel 2>&1', {
        encoding: 'utf-8',
        cwd: path.resolve(__dirname, '..')
    });

    console.log('\nTest Results:');
    console.log(result);

    console.log('\n✅ All progressive tests completed');
    console.log('Note: Test images are generated in temporary directories during test execution');
    console.log('To preserve images, modify tests to save to a permanent location');

} catch (error) {
    console.error('Error running tests:', error.message);
    process.exit(1);
}
