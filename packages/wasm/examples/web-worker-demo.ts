/**
 * Example usage of BuzzU WASM with Web Workers
 * Demonstrates performance improvements and bug fixes
 */

import { 
  initWasm, 
  initializeWorker, 
  processCryptoInWorker,
  measureConnectionQualityInWorker,
  processLargeDatasetInWorker
} from '../js-bridge/bridge';

// Performance monitoring
const performanceMetrics = {
  cryptoTime: 0,
  connectionQualityTime: 0,
  datasetProcessingTime: 0,
  workerInitializationTime: 0
};

/**
 * Initialize the application with Web Worker support
 */
async function initializeApp() {
  console.log('🚀 Initializing BuzzU WASM with Web Worker support...');
  
  try {
    // Initialize main WASM module
    await initWasm();
    console.log('✅ WASM module initialized');
    
    // Initialize Web Worker
    const workerStartTime = performance.now();
    const workerInitialized = await initializeWorker();
    performanceMetrics.workerInitializationTime = performance.now() - workerStartTime;
    
    if (workerInitialized) {
      console.log('✅ Web Worker initialized in', performanceMetrics.workerInitializationTime.toFixed(2), 'ms');
    } else {
      console.warn('⚠️ Web Worker initialization failed, falling back to main thread');
    }
    
    console.log('🎉 Application initialized successfully!');
    
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    throw error;
  }
}

/**
 * Demonstrate crypto operations in Web Worker
 */
async function demonstrateCryptoWorker() {
  console.log('🔐 Testing crypto operations in Web Worker...');
  
  const testData = new TextEncoder().encode('Hello, BuzzU WASM with Web Workers!');
  const key = 'your-base64-encoded-32-byte-key-here-1234567890abcdef';
  const nonce = 'your-base64-12-byte-nonce-here';
  
  try {
    const startTime = performance.now();
    
    // Encrypt in worker
    const encrypted = await processCryptoInWorker(key, testData, nonce);
    console.log('✅ Encrypted data in worker:', encrypted.byteLength, 'bytes');
    
    // Decrypt in worker
    const decrypted = await processCryptoInWorker(key, encrypted, nonce);
    const decryptedText = new TextDecoder().decode(decrypted);
    
    performanceMetrics.cryptoTime = performance.now() - startTime;
    
    console.log('✅ Decrypted data:', decryptedText);
    console.log('⏱️ Crypto operations completed in', performanceMetrics.cryptoTime.toFixed(2), 'ms');
    
  } catch (error) {
    console.error('❌ Crypto operation failed:', error);
  }
}

/**
 * Demonstrate connection quality measurement in Web Worker
 */
async function demonstrateConnectionQuality() {
  console.log('📊 Testing connection quality measurement in Web Worker...');
  
  // Simulate RTT measurements
  const rttData = [
    performance.now(),
    performance.now() + 25,   // 25ms RTT
    performance.now() + 30,   // 30ms RTT
    performance.now() + 45,   // 45ms RTT
    performance.now() + 20,   // 20ms RTT
    performance.now() + 35,   // 35ms RTT
  ];
  
  try {
    const startTime = performance.now();
    
    const result = await measureConnectionQualityInWorker(rttData);
    
    performanceMetrics.connectionQualityTime = performance.now() - startTime;
    
    console.log('✅ Connection quality measured:');
    console.log('  - State:', result.qualityState);
    console.log('  - Average RTT:', result.averageRtt.toFixed(2), 'ms');
    console.log('  - Quality Score:', (result.qualityScore * 100).toFixed(1) + '%');
    console.log('  - Summary:', result.summary);
    console.log('⏱️ Measurement completed in', performanceMetrics.connectionQualityTime.toFixed(2), 'ms');
    
  } catch (error) {
    console.error('❌ Connection quality measurement failed:', error);
  }
}

/**
 * Demonstrate large dataset processing in Web Worker
 */
async function demonstrateLargeDatasetProcessing() {
  console.log('📈 Testing large dataset processing in Web Worker...');
  
  // Create a large dataset (1MB)
  const datasetSize = 1024 * 1024;
  const largeDataset = new Uint8Array(datasetSize);
  
  // Fill with some data
  for (let i = 0; i < datasetSize; i++) {
    largeDataset[i] = i % 256;
  }
  
  try {
    const startTime = performance.now();
    
    const result = await processLargeDatasetInWorker(largeDataset);
    
    performanceMetrics.datasetProcessingTime = performance.now() - startTime;
    
    console.log('✅ Large dataset processed:', result);
    console.log('⏱️ Processing completed in', performanceMetrics.datasetProcessingTime.toFixed(2), 'ms');
    
  } catch (error) {
    console.error('❌ Dataset processing failed:', error);
  }
}

/**
 * Compare performance: Worker vs Main Thread
 */
async function comparePerformance() {
  console.log('⚡ Comparing Worker vs Main Thread performance...');
  
  // Test data
  const testData = new TextEncoder().encode('Performance comparison test data');
  const key = 'your-base64-encoded-32-byte-key-here-1234567890abcdef';
  const nonce = 'your-base64-12-byte-nonce-here';
  
  // Worker performance
  const workerStart = performance.now();
  await processCryptoInWorker(key, testData, nonce);
  const workerTime = performance.now() - workerStart;
  
  // Main thread performance (if available)
  let mainThreadTime = 0;
  try {
    const { initWasm } = await import('../js-bridge/bridge');
    const module = await initWasm();
    
    const mainStart = performance.now();
    const crypto = new module.CryptoEngine(key);
    crypto.encrypt('Performance comparison test data', nonce);
    mainThreadTime = performance.now() - mainStart;
    
  } catch (error) {
    console.warn('Main thread comparison not available');
  }
  
  console.log('📊 Performance Comparison:');
  console.log('  - Worker Time:', workerTime.toFixed(2), 'ms');
  console.log('  - Main Thread Time:', mainThreadTime.toFixed(2), 'ms');
  
  if (mainThreadTime > 0) {
    const improvement = ((mainThreadTime - workerTime) / mainThreadTime * 100);
    console.log('  - Performance Improvement:', improvement.toFixed(1) + '%');
  }
}

/**
 * Run all demonstrations
 */
async function runAllDemonstrations() {
  console.log('🎯 Running all BuzzU WASM Web Worker demonstrations...\n');
  
  try {
    await initializeApp();
    console.log('');
    
    await demonstrateCryptoWorker();
    console.log('');
    
    await demonstrateConnectionQuality();
    console.log('');
    
    await demonstrateLargeDatasetProcessing();
    console.log('');
    
    await comparePerformance();
    console.log('');
    
    // Summary
    console.log('📋 Performance Summary:');
    console.log('  - Worker Initialization:', performanceMetrics.workerInitializationTime.toFixed(2), 'ms');
    console.log('  - Crypto Operations:', performanceMetrics.cryptoTime.toFixed(2), 'ms');
    console.log('  - Connection Quality:', performanceMetrics.connectionQualityTime.toFixed(2), 'ms');
    console.log('  - Dataset Processing:', performanceMetrics.datasetProcessingTime.toFixed(2), 'ms');
    
    console.log('\n🎉 All demonstrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Demonstration failed:', error);
  }
}

// Export for use in other modules
export {
  initializeApp,
  demonstrateCryptoWorker,
  demonstrateConnectionQuality,
  demonstrateLargeDatasetProcessing,
  comparePerformance,
  runAllDemonstrations,
  performanceMetrics
};

// Auto-run if this is the main module
if (typeof (globalThis as any).module === 'undefined') {
  runAllDemonstrations().catch(console.error);
}