
let similar = ImageColor.isColorSimilar("#FF5733", "#FF6E4A", 0.85)
console.log("Is #FF5733 similar to #FF6E4A with 85% similarity? ", similar.data, similar );


// Take screenshot
let base64Image = await page.screenshot();
console.log("Screenshot captured, checking for colors...");

// Test pixel color at specific coordinates
const color = await ImageColor.pixel(base64Image, 100, 100);
console.log("Color at (100,100):", color);
await page.waitFor(1000);

// Test finding a specific color (e.g., white #FFFFFF)
// Convert options to JSON string
const options = {
    threshold: 5,
    x: 0,
    y: 0,
    width: 500,
    height: 500
};
const findWhite = await ImageColor.findColor(base64Image, "#FFFFFF", options);
console.log("Found white color at:", findWhite);
await page.waitFor(1000);

// Test hasColor for black (#000000)
const hasBlack = await ImageColor.hasColor(base64Image, "#000000", 0, 0);
console.log("Has black color:", hasBlack);
await page.waitFor(1000);

// Test isGray in a region
const isGrayRegion = await ImageColor.isGray(base64Image, 0, 0, 200, 200, 10);
console.log("Region is gray:", isGrayRegion);
await page.waitFor(1000);

// Get image size
const size = await ImageColor.getSize(base64Image);
console.log("Image size:", size);
await page.waitFor(1000);

// Find specific UI element by color (e.g., blue button)
const blueButtonOptions = JSON.stringify({
    threshold: 20,
    x: 0,
    y: 0
});

const blueButton = await ImageColor.findColor(base64Image, "#0000FF", blueButtonOptions);
console.log("Blue button location:", blueButton);

// Check for text input field
const textFieldOptions = JSON.stringify({
    threshold: 15,
    x: 0,
    y: 0,
    width: size[0],
    height: size[1]
});
const textField = await ImageColor.findColor(base64Image, "#FFFFFF", textFieldOptions);
console.log("Text field location:", textField);

// 点击 1865 430 

await page.mouse.click(1865, 430);
await page.waitFor(1000);

base64Image = await page.screenshot();

// Test for light gray color (RGB 245,245,245 = #F5F5F5)
const lightGrayOptions = {
    threshold: 5,  // Adjust threshold as needed
    x: 0,
    y: 0,
    width: size[0],
    height: size[1]
}

// Find color using original method
const lightGrayResult = await ImageColor.findColor(base64Image, "#F5F5F5", lightGrayOptions);
console.log("Light gray area found (original method):", lightGrayResult);


console.log("start to find color blocks");

// Find color blocks using new method
const lightGrayBlocks = await ImageColor.findColorBlocks(base64Image, "#F5F5F5", lightGrayOptions);
console.log("Light gray blocks found (new method):", lightGrayBlocks );

console.log("end to find color blocks");

// Analyze and log details about found blocks
const blocks = lightGrayBlocks;
if (blocks && blocks.length > 0) {
    console.log("\nDetailed analysis of found color blocks:");
    blocks.forEach((block, index) => {
        console.log(`\nBlock ${index + 1}:`);
        console.log(`Position: (${block.x}, ${block.y})`);
        console.log(`Size: ${block.width}x${block.height}`);
        console.log(`Shape: ${block.shape}`);
        console.log(`Match percentage: ${(block.match * 100).toFixed(2)}%`);
        console.log(`Area: ${block.area} pixels`);
    });

    // Find the largest block (potential main UI element)
    const largestBlock = blocks.reduce((max, block) => 
        block.area > max.area ? block : max, blocks[0]);
    console.log("\nLargest light gray block:", {
        position: `(${largestBlock.x}, ${largestBlock.y})`,
        size: `${largestBlock.width}x${largestBlock.height}`,
        shape: largestBlock.shape,
        match: `${(largestBlock.match * 100).toFixed(2)}%`
    });
}

// Verify if specific coordinates (1865, 430) are within any detected block
const targetX = 1865;
const targetY = 430;
const containingBlocks = blocks.filter(block => 
    targetX >= block.x && 
    targetX <= (block.x + block.width) && 
    targetY >= block.y && 
    targetY <= (block.y + block.height)
);

if (containingBlocks.length > 0) {
    console.log("\nTarget coordinates (1865, 430) found within blocks:", 
        containingBlocks.map((block, index) => `Block ${index + 1}`).join(", "));
} else {
    console.log("\nTarget coordinates (1865, 430) not found within any light gray block");
}

// Additional color verification around target coordinates
const surroundingArea = JSON.stringify({
    threshold: 5,
    x: targetX - 10,
    y: targetY - 10,
    width: 20,
    height: 20
});

const isTargetAreaGray = await ImageColor.isGray(base64Image, targetX - 10, targetY - 10, 20, 20, 5);
console.log("\nTarget area gray verification:", isTargetAreaGray);


const goldenColorHex = "#FFD101";

// Find color blocks
const goldenBlocks = await ImageColor.findColorBlocks(base64Image, goldenColorHex);
console.log("\nSearching for RGB(255,209,1) / #FFD101", goldenBlocks);

// Test case 1: Crop central region
const croppedImage1 = await ImageColor.clip(base64Image,  {x: 100,y: 100,width: 200,height: 200});
console.log("Cropped central region:", {
    resultLength: croppedImage1.length,
    success: croppedImage1.startsWith("data:image/png;base64,") || croppedImage1.length > 0
});

console.info("ImageColor tests completed successfully");
