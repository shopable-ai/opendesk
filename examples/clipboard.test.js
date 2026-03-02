// Clipboard Operations Stress Test
// This script will stress test clipboard operations with various test cases,
// error handling, and detailed statistics tracking

// Configuration
const config = {
    totalTests: 100,           // Total number of tests to run
    delayBetweenTests: 100,    // Milliseconds between tests (increased for better reliability)
    stringLengthMin: 10,       // Minimum generated string length
    stringLengthMax: 1000,     // Maximum generated string length (reduced to avoid memory issues)
    specialTestCases: true,    // Include edge cases
    logFrequency: 10,          // Log status every N tests
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
  
  // Special test cases generators
  function generateSpecialTestCases() {
    return [
      ' ', // Single space (replaced empty string)
      '     ', // Multiple spaces
      '\n\n\n', // Multiple newlines
      '\t\t\t', // Multiple tabs
      '😀🚀🌍🔥', // Emojis
      '东京/北京/上海/香港', // Chinese characters
      'α β γ δ ε π ∞ ∑ √', // Mathematical symbols
      '<!-- HTML comment -->',
      '{"key": "value", "nested": {"key2": 123}}', // JSON
      'a'.repeat(500), // Repeated characters
      generateRandomString(500) // Random string
    ];
  }
  
  // Main stress test function
  async function runClipboardStressTest() {
    // Initialize global results object
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
    
    // Prepare special test cases
    const specialCases = config.specialTestCases ? generateSpecialTestCases() : [];
    const totalSpecialCases = specialCases.length;
    let specialCaseIndex = 0;
    
    console.log(`Starting clipboard stress test with ${config.totalTests} iterations...`);
    console.log(`Configuration: `, config);
    
    // Main test loop
    for (let i = 0; i < config.totalTests; i++) {
      try {
        // Generate test content
        let testContent;
        if (config.specialTestCases && specialCaseIndex < totalSpecialCases && i % 10 === 0) {
          // Use a special test case every 10 iterations
          testContent = specialCases[specialCaseIndex];
          specialCaseIndex = (specialCaseIndex + 1) % totalSpecialCases;
          console.log(`Test #${i+1}: Using special test case: "${testContent.length > 20 ? testContent.substring(0, 20) + '...' : testContent}"`);
        } else {
          const length = Math.floor(Math.random() * (config.stringLengthMax - config.stringLengthMin + 1)) + config.stringLengthMin;
          testContent = generateRandomString(length);
          console.log(`Test #${i+1}: Using random string of length ${testContent.length}`);
        }
        
        // Clear clipboard first
        try {
          clipboard.clear();
          await sleep(50); // Brief pause after clearing
        } catch (clearError) {
          console.warn(`Warning: Failed to clear clipboard: ${clearError}`);
        }
        
        // Try to copy to clipboard
        let writeSuccess = false;
        try {
          clipboard.copy(testContent);
          writeSuccess = true;
          results.successfulWrites++;
        } catch (writeError) {
          results.failures.writeFailures++;
          console.error(`Error copying to clipboard in test #${i+1}: ${writeError}`);
          if (config.logDetailedErrors) {
            results.errors.push({
              testNumber: i + 1,
              error: 'Write failed',
              message: writeError.toString(),
              contentLength: testContent.length
            });
          }
        }
        
        // Wait between operations
        await sleep(config.delayBetweenTests);
        
        // Try to read from clipboard
        let readContent = null;
        try {
          readContent = await clipboard.paste();
          results.successfulReads++;
        } catch (readError) {
          results.failures.readFailures++;
          console.error(`Error reading from clipboard in test #${i+1}: ${readError}`);
          if (config.logDetailedErrors) {
            results.errors.push({
              testNumber: i + 1,
              error: 'Read failed',
              message: readError.toString(),
              testCase: testContent.length > 50 ? `${testContent.substring(0, 50)}... (${testContent.length} chars)` : testContent
            });
          }
        }
        
        // Check content match if both operations succeeded
        if (writeSuccess && readContent !== null) {
          results.fullSuccesses++;
          
          if (readContent === testContent) {
            results.matchSuccesses++;
            console.log(`Test #${i+1}: Content match successful`);
          } else {
            results.failures.contentMismatch++;
            console.warn(`Test #${i+1}: Content mismatch!`);
            
            if (config.logDetailedErrors) {
              // Find first difference position
              let diffPosition = -1;
              for (let j = 0; j < Math.min(testContent.length, readContent.length); j++) {
                if (testContent[j] !== readContent[j]) {
                  diffPosition = j;
                  break;
                }
              }
              
              results.errors.push({
                testNumber: i + 1,
                error: 'Content mismatch',
                expected: testContent.length > 50 ? `${testContent.substring(0, 50)}... (${testContent.length} chars)` : testContent,
                actual: readContent.length > 50 ? `${readContent.substring(0, 50)}... (${readContent.length} chars)` : readContent,
                expectedLength: testContent.length,
                actualLength: readContent.length,
                diffPosition: diffPosition,
                diffContext: diffPosition > -1 ? `...${testContent.substring(Math.max(0, diffPosition-10), diffPosition)}[${testContent[diffPosition]}]${testContent.substring(diffPosition+1, diffPosition+11)}...` : 'N/A'
              });
            }
          }
        }
        
        // Increment test counter
        results.totalTests++;
        
        // Show progress
        if ((i + 1) % config.logFrequency === 0 || i === config.totalTests - 1) {
          console.log(`Progress: ${i + 1}/${config.totalTests} tests (${Math.round((i + 1) / config.totalTests * 100)}%)`);
          console.log(`Success rates - Write: ${Math.round(results.successfulWrites / (i + 1) * 100)}%, Read: ${Math.round(results.successfulReads / (i + 1) * 100)}%, Match: ${Math.round(results.matchSuccesses / (i + 1) * 100)}%`);
        }
        
      } catch (error) {
        console.error(`Fatal error in test #${i + 1}:`, error);
        if (config.logDetailedErrors) {
          results.errors.push({
            testNumber: i + 1,
            error: 'Fatal test error',
            message: error.toString(),
            stack: error.stack
          });
        }
        
        // Make sure to always increment the counter even if there's an error
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
      console.log('\nError Summary:');
      console.log(`- Total Errors: ${results.errors.length}`);
      
      // Group errors by type
      const errorGroups = {};
      results.errors.forEach(err => {
        const errorType = err.error;
        errorGroups[errorType] = (errorGroups[errorType] || 0) + 1;
      });
      
      // Print error distribution
      console.log('\nError Distribution:');
      Object.entries(errorGroups).forEach(([errorType, count]) => {
        console.log(`- ${errorType}: ${count} occurrences (${(count / results.errors.length * 100).toFixed(2)}%)`);
      });
      
      // Print some sample errors
      console.log('\nSample Error Details (maximum 5):');
      results.errors.slice(0, 5).forEach((err, index) => {
        console.log(`\nError #${index + 1}:`);
        console.log(JSON.stringify(err, null, 2));
      });
    } else {
      console.log('\nNo errors detected! 🎉');
    }
    
    console.log('\n================ END OF TEST REPORT =================');
    
    return results;
  }
  
  console.log('Starting clipboard stress test...');
  const results = await runClipboardStressTest();
  console.log('Test completed successfully with results available');