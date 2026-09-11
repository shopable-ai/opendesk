const prefix = 'example-app-storage-' + Execution.id;
const textKey = prefix + '-text';
const jsonKey = prefix + '-json';

const textValue = 'OpenDesk AppStorage example';
AppStorage.setItem(textKey, textValue);
const textReadback = AppStorage.getItem(textKey);
console.log('text readback:', textReadback);
if (textReadback !== textValue) throw new Error('AppStorage text readback mismatch');

const value = {name: 'OpenDesk', items: [1, 2, 3], enabled: true};
AppStorage.setItem(jsonKey, JSON.stringify(value));
const jsonReadback = JSON.parse(AppStorage.getItem(jsonKey));
console.log('json readback:', jsonReadback);
if (JSON.stringify(jsonReadback) !== JSON.stringify(value)) {
  throw new Error('AppStorage JSON readback mismatch');
}

console.log('AppStorage keeps values beyond this execution; example keys use the current Execution.id prefix.');
