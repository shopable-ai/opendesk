const opencvRuntimeDir = '.runtime/temp/examples/opencv';
File.ensureDir(opencvRuntimeDir);

// Capture full screenshot and save to path
let bigImage = await page.screenshot({
    path: `${opencvRuntimeDir}/screenshot.png`
});
console.log("Screenshot captured:", `${opencvRuntimeDir}/screenshot.png`, bigImage.substring(0, 100) + "...");

// Get order status area screenshot with specific region
let cut = await page.screenshot({
    path: `${opencvRuntimeDir}/screenshot_cut.png`,
    clip: {
        x: 55,
        y: 66,
        width: 100,
        height: 200
    }
});
console.log("Clipped screenshot saved:", `${opencvRuntimeDir}/screenshot_cut.png`);

let info = await ImageColor.findPos(bigImage, cut);
console.log("ImageColor findImage in opencv:", info);

let opencvImg = `${opencvRuntimeDir}/opencv.jpg`;
// Get the size of the big image
let [bigWidth, bigHeight] = ImageColor.getSize(opencvImg);
let openCvBase64 = ImageColor.loadBase64(opencvImg);
console.log(`Big image size: ${bigWidth}x${bigHeight}, openCvBase64:`, openCvBase64?.substring(0, 100));

for (let i = 0; i < 5; i++) {
    const randomX = Math.floor(Math.random() * (bigWidth - 100));
    const randomY = Math.floor(Math.random() * (bigHeight - 200));
    console.log(`Test ${i + 1}: Generating clip at (${randomX}, ${randomY})`);

    // let randomCut = await ImageColor.clip(bigImage, { x: randomX, y: randomY, width: 100, height: 200 } );   // test fail
    // Generate random clipped screenshot directly instead of using ImageColor.clip
    let randomCut = await page.screenshot({
        path: `${opencvRuntimeDir}/random_cut_${i}.png`,
        clip: { x: randomX, y: randomY, width: 100, height: 200 }
    });

    let randomInfo = await ImageColor.findPos(bigImage, `${opencvRuntimeDir}/random_cut_${i}.png`);   // test ok
    // let randomInfo = await ImageColor.findPos(bigImage, randomCut);  //  test ok
    console.log(`Result for test ${i + 1}:`, randomInfo);

    if (randomInfo.found) {
        const foundX = randomInfo.x;
        const foundY = randomInfo.y;
        if (foundX === randomX && foundY === randomY) {
            console.log(`Test ${i + 1} PASSED: Found exact match at (${foundX}, ${foundY})`);
        } else {
            console.log(`Test ${i + 1} FAILED: Expected (${randomX}, ${randomY}), but found (${foundX}, ${foundY})`);
        }
        if (randomInfo.width === 100 && randomInfo.height === 200) {
            console.log(`Test ${i + 1} size check PASSED`);
        } else {
            console.log(`Test ${i + 1} size check FAILED`);
        }
    } else {
        console.log(`Test ${i + 1} FAILED: No match found (confidence: ${randomInfo.confidence})`);
    }
}
