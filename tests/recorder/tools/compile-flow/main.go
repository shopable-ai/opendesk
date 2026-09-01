package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"opendesk/pkg/recorder"
)

func main() {
	var root, flowPath, replayConfigPath string
	flag.StringVar(&root, "recorder-root", ".runtime/recordings", "recorder artifact root")
	flag.StringVar(&flowPath, "flow", "", "distilled flow JSON")
	flag.StringVar(&replayConfigPath, "replay-config", "", "replay config path embedded in generated JavaScript")
	flag.Parse()
	if flowPath == "" {
		log.Fatal("-flow is required")
	}
	data, err := os.ReadFile(flowPath)
	if err != nil {
		log.Fatal(err)
	}
	var flow recorder.Flow
	if err := json.Unmarshal(data, &flow); err != nil {
		log.Fatal(err)
	}
	manager, err := recorder.NewManager(root)
	if err != nil {
		log.Fatal(err)
	}
	generated, err := manager.Compile(flow.SessionID, flow, recorder.CompileOptions{ReplayConfigPath: replayConfigPath})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(generated)
}
