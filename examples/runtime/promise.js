console.log('=== Promise 示例 ===');

const delayed = new Promise(resolve => setTimeout(() => resolve('success'), 100));
console.log('await:', await delayed);

const values = await Promise.all([
  Promise.resolve(1),
  new Promise(resolve => setTimeout(() => resolve(2), 50)),
  Promise.resolve(3),
]);
console.log('Promise.all:', values);

try {
  await Promise.reject(new Error('example rejection'));
} catch (error) {
  console.log('Promise rejection:', error.message);
}

const winner = await Promise.race([
  new Promise(resolve => setTimeout(() => resolve('slow'), 100)),
  new Promise(resolve => setTimeout(() => resolve('fast'), 50)),
]);
console.log('Promise.race:', winner);
