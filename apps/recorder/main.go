// Command recorder is the thin local artifact entry for OpenDesk Recorder.
// Live session control is intentionally exposed by cmd/opendesk-mcp.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	var root, sessionID, artifact string
	flag.StringVar(&root, "root", ".runtime/recordings", "Recorder artifact root")
	flag.StringVar(&sessionID, "session", "", "Recorder session id")
	flag.StringVar(&artifact, "artifact", "manifest", "artifact to print: manifest, flow, variables, or report")
	flag.Parse()
	if sessionID == "" || sessionID == "." || sessionID == ".." || strings.ContainsAny(sessionID, `/\\`) {
		log.Fatal("-session must be a safe Recorder session id")
	}
	relative := map[string]string{
		"manifest": "manifest.json", "flow": "distilled/flow.json",
		"variables": "distilled/variables.json", "report": "distilled/report.json",
	}[artifact]
	if relative == "" {
		log.Fatal("-artifact must be manifest, flow, variables, or report")
	}
	root, err := filepath.Abs(root)
	if err != nil {
		log.Fatal(err)
	}
	path := filepath.Join(root, sessionID, relative)
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatal(err)
	}
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		log.Fatal(err)
	}
	encoded, _ := json.MarshalIndent(value, "", "  ")
	fmt.Println(string(encoded))
}
