let position = await page.mouse.getPos();
console.log("mouse position: ", position);

// GetDepth
// let depth = await Screen.getDepth();
// console.log("Screen depth: ", depth);

let bigImage = await page.screenshot();
console.log("Screenshot captured, checking for colors...");


// Get order status area screenshot
let screenshot = await page.screenshot({
    path: '.runtime/temp/opencv_cut.png',
    clip: {
        x: 55,
        y: 66,
        width: 100,
        height: 200
    }
});
// let info = await ImageColor.findImage(bigImage, screenshot);
// console.log("ImageColor findImage in opencv:", info);
