// Example JavaScript code for using the floating window
async function initializeFloatingWindow() {

    console.log("Initializing floating window...");
    
    // Show the floating window
    FloatingWindow.show();
    
    // Set window position
    FloatingWindow.setPosition(100, 100);
    
    // Set window to always be on top
    FloatingWindow.setAlwaysOnTop(true);
    
    // Add custom button handlers
    FloatingWindow.onButtonClick("start", async () => {
        console.log("Start button clicked");
        // Example automation sequence
        await mouse.move(500, 500);
        await mouse.click(500, 500);
    });
    
    FloatingWindow.onButtonClick("pause", () => {
        console.log("Pause button clicked");
        // Add pause logic here
    });
    
    FloatingWindow.onButtonClick("stop", () => {
        console.log("Stop button clicked");
        // Add stop logic here
    });
    
    // Add a custom button with a predefined icon name
    FloatingWindow.addButton("custom", "Custom", "search");  // Using "search" icon
    
    // Add another custom button with a different icon
    FloatingWindow.addButton("info", "Info", "info");  // Using "info" icon
    
    // Add handler for custom button
    FloatingWindow.onButtonClick("custom", async () => {
        console.log("Custom button clicked");
        await mouse.move(550, 300);
        await mouse.click(550, 300);
    });

    await sleep(60 * 1000 * 5)
}

// Initialize the floating window when script starts
await initializeFloatingWindow();
