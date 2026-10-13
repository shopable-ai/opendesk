package main

import (
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/provider/codexreset"
	"net/http"
	"testing"
)

func TestProbeDoesNotMislabelCacheOnlyAsLive(t *testing.T) {
	all := map[string]codexreset.Result{}
	for _, name := range codexreset.Endpoints {
		all[name] = codexreset.Result{Name: name, Status: "ok", HTTPStatus: http.StatusOK}
	}
	if !liveProbeVerified(all, nil) {
		t.Fatal("four actual successful GETs were not counted")
	}
	first := codexreset.Endpoints[0]
	cached := all[first]
	cached.FromCache = true
	cached.HTTPStatus = 0
	all[first] = cached
	if liveProbeVerified(all, nil) {
		t.Fatal("cached data mislabeled as four real GETs")
	}
	delete(all, first)
	if liveProbeVerified(all, nil) {
		t.Fatal("missing endpoint mislabeled live")
	}
}