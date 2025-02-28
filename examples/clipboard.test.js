// Clipboard Operations Stress Test
// This script will stress test clipboard operations with various test cases,
// error handling, and detailed statistics tracking

// Configuration
const config = {
    totalTests: 10000,         // Total number of tests to run
    delayBetweenTests: 50,     // Milliseconds between tests
    stringLengthMin: 10,       // Minimum generated string length
    stringLengthMax: 2000,     // Maximum generated string length
    specialTestCases: true,    // Include edge cases
    logFrequency: 500,         // Log status every N tests
    logDetailedErrors: true    // Log detailed error information
  };
  
  // Utility functions
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !@#$%^&*()-_=+[]{}|;:,.<>?/~`';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }
  
  
  function clearClipboard() {
    try {
      clipboard.clear();
      return true;
    } catch (error) {
      console.error('Error clearing clipboard:', error);
      return false;
    }
  }
  
  // Special test cases generators
  function generateSpecialTestCases() {
    return [
      '', // Empty string
      ' ', // Single space
      '     ', // Multiple spaces
      '\n\n\n', // Multiple newlines
      '\t\t\t', // Multiple tabs
      '😀🚀🌍🔥', // Emojis
      '东京/北京/上海/香港', // Chinese characters
      'α β γ δ ε π ∞ ∑ √', // Mathematical symbols
      '<!-- HTML comment -->',
      '{"key": "value", "nested": {"key2": 123}}', // JSON
      'a'.repeat(10000), // Very long repeating character
      generateRandomString(10000) // Very long random string
    ];
  }
  
  // Main stress test function
  async function runClipboardStressTest() {
    const results = {
      totalTests: 0,
      successfulWrites: 0,
      successfulReads: 0,
      fullSuccesses: 0, // Both write and read successful
      matchSuccesses: 0, // Content matches after read
      failures: {
        writeFailures: 0,
        readFailures: 0,
        contentMismatch: 0
      },
      errors: []
    };
    
    const specialCases = config.specialTestCases ? generateSpecialTestCases() : [];
    const totalSpecialCases = specialCases.length;
    let specialCaseIndex = 0;
    
    console.log(`Starting clipboard stress test with ${config.totalTests} iterations...`);
    console.log(`Configuration: `, config);
    
    for (let i = 0; i < config.totalTests; i++) {
      try {
        // Generate test content
        let testContent;
        if (config.specialTestCases && specialCaseIndex < totalSpecialCases) {
          // Use a special test case every 20 iterations
          if (i % 20 === 0) {
            testContent = specialCases[specialCaseIndex];
            specialCaseIndex = (specialCaseIndex + 1) % totalSpecialCases;
          } else {
            const length = Math.floor(Math.random() * (config.stringLengthMax - config.stringLengthMin + 1)) + config.stringLengthMin;
            testContent = generateRandomString(length);
          }
        } else {
          const length = Math.floor(Math.random() * (config.stringLengthMax - config.stringLengthMin + 1)) + config.stringLengthMin;
          testContent = generateRandomString(length);
        }
        
        // Clear clipboard first
        clearClipboard();
        await sleep(10); // Brief pause
        
        // Copy to clipboard
        const writeSuccess = copyToClipboard(testContent);
        if (writeSuccess) results.successfulWrites++;
        else results.failures.writeFailures++;
        
        // Wait for write to complete
        await sleep(config.delayBetweenTests);
        
        // Read from clipboard
        const readContent = await getClipboard();
        
        // Check read success
        if (readContent !== null) {
          results.successfulReads++;
          
          // Check content match
          if (readContent === testContent) {
            results.matchSuccesses++;
          } else {
            results.failures.contentMismatch++;
            if (config.logDetailedErrors) {
              results.errors.push({
                testNumber: i + 1,
                error: 'Content mismatch',
                expected: testContent,
                actual: readContent,
                expectedLength: testContent.length,
                actualLength: readContent.length,
                // Find first difference position
                diffPosition: [...testContent].findIndex((char, index) => char !== readContent[index]),
                testCase: testContent.length > 50 ? 'Random string' : testContent
              });
            }
          }
        } else {
          results.failures.readFailures++;
          if (config.logDetailedErrors) {
            results.errors.push({
              testNumber: i + 1,
              error: 'Read failed',
              testCase: testContent.length > 50 ? 'Random string' : testContent,
              contentLength: testContent.length
            });
          }
        }
        
        // Increment test counter
        results.totalTests++;
        
        // Full success if both write and read succeeded
        if (writeSuccess && readContent !== null) {
          results.fullSuccesses++;
        }
        
        // Show progress
        if ((i + 1) % config.logFrequency === 0 || i === config.totalTests - 1) {
          console.log(`Progress: ${i + 1}/${config.totalTests} tests (${Math.round((i + 1) / config.totalTests * 100)}%)`);
          console.log(`Intermediate stats - Success rate: ${Math.round(results.matchSuccesses / (i + 1) * 100)}%`);
        }
        
      } catch (error) {
        console.error(`Fatal error in test #${i + 1}:`, error);
        if (config.logDetailedErrors) {
          results.errors.push({
            testNumber: i + 1,
            error: 'Fatal test error',
            message: error.message,
            stack: error.stack
          });
        }
      }
      
      // Make sure to always increment the counter even if there's an error
      if (results.totalTests !== i + 1) {
        results.totalTests = i + 1;
      }
    }
    
    // Calculate final statistics
    const stats = {
      writeSuccessRate: (results.successfulWrites / results.totalTests * 100).toFixed(2) + '%',
      readSuccessRate: (results.successfulReads / results.totalTests * 100).toFixed(2) + '%',
      fullSuccessRate: (results.fullSuccesses / results.totalTests * 100).toFixed(2) + '%',
      contentMatchRate: (results.matchSuccesses / results.totalTests * 100).toFixed(2) + '%',
      errors: {
        writeFailureRate: (results.failures.writeFailures / results.totalTests * 100).toFixed(2) + '%',
        readFailureRate: (results.failures.readFailures / results.totalTests * 100).toFixed(2) + '%',
        contentMismatchRate: (results.failures.contentMismatch / results.totalTests * 100).toFixed(2) + '%'
      }
    };
    
    // Print final report
    console.log('\n========== CLIPBOARD STRESS TEST REPORT ==========');
    console.log(`Tests completed: ${results.totalTests}/${config.totalTests}`);
    console.log('\nSuccess Rates:');
    console.log(`- Write Success Rate: ${stats.writeSuccessRate}`);
    console.log(`- Read Success Rate: ${stats.readSuccessRate}`);
    console.log(`- Full Operation Success Rate: ${stats.fullSuccessRate}`);
    console.log(`- Content Match Success Rate: ${stats.contentMatchRate} ← MOST IMPORTANT`);
    console.log('\nFailure Rates:');
    console.log(`- Write Failure Rate: ${stats.errors.writeFailureRate}`);
    console.log(`- Read Failure Rate: ${stats.errors.readFailureRate}`);
    console.log(`- Content Mismatch Rate: ${stats.errors.contentMismatchRate}`);
    
    if (results.errors.length > 0) {
      console.log('\nError Distribution:');
      
      // Group errors by type
      const errorGroups = {};
      results.errors.forEach(err => {
        const errorType = err.error;
        errorGroups[errorType] = (errorGroups[errorType] || 0) + 1;
      });
      
      // Print error distribution
      Object.entries(errorGroups).forEach(([errorType, count]) => {
        console.log(`- ${errorType}: ${count} occurrences (${(count / results.errors.length * 100).toFixed(2)}%)`);
      });
      
      // Print some sample errors
      console.log('\nSample Error Details (maximum 5):');
      results.errors.slice(0, 5).forEach((err, index) => {
        console.log(`\nError #${index + 1}:`);
        console.log(JSON.stringify(err, null, 2));
      });
    }
    
    console.log('\n=========== END OF TEST REPORT ===========');
    
    return {
      results,
      stats
    };
  }
  
  // Run the stress test
  runClipboardStressTest()
    .then(({ results, stats }) => {
      console.log('Test completed successfully');
      // You can do additional analysis or save results here if needed
    })
    .catch(error => {
      console.error('Test framework error:', error);
    });