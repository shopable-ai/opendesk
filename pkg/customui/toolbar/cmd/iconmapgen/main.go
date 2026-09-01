package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"os"
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

func main() {
	source := flag.String("source", "", "registry JSON")
	goOut := flag.String("go-out", "", "generated Go file")
	objcOut := flag.String("objc-out", "", "generated Objective-C include")
	flag.Parse()
	data, err := os.ReadFile(*source)
	must(err)
	var value registry
	must(json.Unmarshal(data, &value))
	if value.SchemaVersion != 1 || len(value.Icons) != 6 {
		must(fmt.Errorf("toolbar icon registry must be schema v1 with exactly six entries"))
	}
	seen := map[string]bool{}
	for _, item := range value.Icons {
		if item.Name == "" || item.Token == "" || item.SystemSymbol == "" || seen[item.Name] {
			must(fmt.Errorf("invalid or duplicate toolbar icon %q", item.Name))
		}
		seen[item.Name] = true
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
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
