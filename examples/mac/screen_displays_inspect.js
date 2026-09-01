const displays = Screen.getDisplays();
const primary = Screen.getPrimaryDisplay();
const virtualBounds = Screen.getVirtualBounds();

console.log('Screen.getDisplays():', JSON.stringify(displays, null, 2));
console.log('Screen.getPrimaryDisplay():', JSON.stringify(primary, null, 2));
console.log('Screen.getVirtualBounds():', JSON.stringify(virtualBounds, null, 2));
