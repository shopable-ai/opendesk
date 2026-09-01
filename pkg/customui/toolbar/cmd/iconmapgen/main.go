package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"math"
	"os"
	"regexp"
	"sort"
)

type registry struct {
	SchemaVersion int    `json:"schemaVersion"`
	Icons         []icon `json:"icons"`
}

type icon struct {
	Name, Token, SystemSymbol string
	Scale, OffsetX, OffsetY   float64
}

const (
	minimumIconCount = 100
	maximumIconCount = 256
)

var (
	iconNamePattern  = regexp.MustCompile(`^[a-z0-9]+([.-][a-z0-9]+)*$`)
	iconTokenPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
)

func main() {
	source := flag.String("source", "", "registry JSON")
	goOut := flag.String("go-out", "", "generated Go file")
	objcOut := flag.String("objc-out", "", "generated Objective-C include")
	tsOut := flag.String("ts-out", "", "generated TypeScript icon declarations")
	flag.Parse()
	data, err := os.ReadFile(*source)
	must(err)
	var value registry
	must(json.Unmarshal(data, &value))
	if value.SchemaVersion != 1 || len(value.Icons) < minimumIconCount || len(value.Icons) > maximumIconCount {
		must(fmt.Errorf("toolbar icon registry must be schema v1 with %d-%d entries", minimumIconCount, maximumIconCount))
	}
	seenNames, seenTokens, seenSymbols := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for _, item := range value.Icons {
		if !iconNamePattern.MatchString(item.Name) || !iconTokenPattern.MatchString(item.Token) ||
			!iconNamePattern.MatchString(item.SystemSymbol) || seenNames[item.Name] || seenTokens[item.Token] || seenSymbols[item.SystemSymbol] ||
			!finite(item.Scale) || item.Scale < 0.5 || item.Scale > 1.25 || !finite(item.OffsetX) || !finite(item.OffsetY) ||
			math.Abs(item.OffsetX) > 4 || math.Abs(item.OffsetY) > 4 {
			must(fmt.Errorf("invalid or duplicate toolbar icon %q", item.Name))
		}
		seenNames[item.Name], seenTokens[item.Token], seenSymbols[item.SystemSymbol] = true, true, true
	}

	var goSource bytes.Buffer
	fmt.Fprintln(&goSource, "// Code generated from assets/toolbar-icons-v1.json; DO NOT EDIT.")
	fmt.Fprintln(&goSource, "package toolbar")
	fmt.Fprintln(&goSource, "\ntype iconDefinition struct { token string; presentation IconPresentation }")
	fmt.Fprintln(&goSource, "\nvar generatedIcons = map[string]iconDefinition{")
	for _, item := range value.Icons {
		fmt.Fprintf(&goSource, "%q: {token:%q, presentation:IconPresentation{SystemSymbol:%q, Scale:%.2f, OffsetX:%.2f, OffsetY:%.2f}},\n", item.Name, item.Token, item.SystemSymbol, item.Scale, item.OffsetX, item.OffsetY)
	}
	fmt.Fprintln(&goSource, "}")
	fmt.Fprintln(&goSource, "\nfunc IconToken(name string) (string, bool) { value, ok := generatedIcons[name]; return value.token, ok }")
	fmt.Fprintln(&goSource, "func IconPresentationFor(name string) (IconPresentation, bool) { value, ok := generatedIcons[name]; return value.presentation, ok }")
	names := make([]string, 0, len(value.Icons))
	for _, item := range value.Icons {
		names = append(names, item.Name)
	}
	sort.Strings(names)
	fmt.Fprint(&goSource, "func IconNames() []string { return []string{")
	for _, name := range names {
		fmt.Fprintf(&goSource, "%q,", name)
	}
	fmt.Fprintln(&goSource, "} }")
	formatted, err := format.Source(goSource.Bytes())
	must(err)
	must(os.WriteFile(*goOut, formatted, 0o644))

	var objc bytes.Buffer
	fmt.Fprintln(&objc, "// Code generated from assets/toolbar-icons-v1.json; DO NOT EDIT.")
	fmt.Fprintln(&objc, "static NSDictionary<NSString *, NSDictionary *> *CDGeneratedToolbarIcons(void) {")
	fmt.Fprintln(&objc, "  static NSDictionary *icons; static dispatch_once_t onceToken; dispatch_once(&onceToken, ^{ icons = @{")
	for _, item := range value.Icons {
		fmt.Fprintf(&objc, "    @%q: @{@\"token\": @%q, @\"systemSymbol\": @%q, @\"scale\": @(%.2f), @\"offsetX\": @(%.2f), @\"offsetY\": @(%.2f)},\n", item.Name, item.Token, item.SystemSymbol, item.Scale, item.OffsetX, item.OffsetY)
	}
	fmt.Fprintln(&objc, "  }; }); return icons;\n}")
	must(os.WriteFile(*objcOut, objc.Bytes(), 0o644))

	var ts bytes.Buffer
	fmt.Fprintln(&ts, "// Code generated from pkg/customui/assets/toolbar-icons-v1.json; DO NOT EDIT.")
	fmt.Fprintln(&ts, "export {};")
	fmt.Fprintln(&ts, "\ndeclare global {")
	fmt.Fprintln(&ts, "  /** Curated, host-reviewed SF Symbols accepted by FloatingWindow. */")
	fmt.Fprintln(&ts, "  type ClawdeskFloatingIcon =")
	for _, name := range names {
		fmt.Fprintf(&ts, "    | %q\n", name)
	}
	fmt.Fprintln(&ts, "}")
	must(os.WriteFile(*tsOut, ts.Bytes(), 0o644))
}

func finite(value float64) bool { return !math.IsInf(value, 0) && !math.IsNaN(value) }

func must(err error) {
	if err != nil {
		panic(err)
	}
}
