package automation

import "testing"

func TestBrowserLifecycleDefaultContextOwnsLegacyPage(t *testing.T) {
	browser := NewBrowser()
	defaultContext := browser.DefaultContext()
	if defaultContext == nil {
		t.Fatal("expected default context")
	}

	page, err := browser.NewPage()
	if err != nil {
		t.Fatalf("browser.NewPage returned error: %v", err)
	}
	if page.Context() != defaultContext {
		t.Fatal("expected legacy page to belong to the default context")
	}
	if page.Browser() != browser {
		t.Fatal("expected legacy page to belong to its browser")
	}
	if got := defaultContext.LastPage(); got != page {
		t.Fatal("expected default context to retain the legacy page")
	}
	if got := browser.LastPage(); got != page {
		t.Fatal("expected browser to retain the legacy page")
	}
}

func TestBrowserLifecycleClosedContainersRejectNewObjects(t *testing.T) {
	browser := NewBrowser()
	context := browser.NewContext()
	if context == nil {
		t.Fatal("expected open browser to create a context")
	}

	if err := context.Close(); err != nil {
		t.Fatalf("context.Close returned error: %v", err)
	}
	if _, err := context.NewPage(); err == nil || err.Error() != "context is closed" {
		t.Fatalf("expected closed context to reject NewPage, got %v", err)
	}

	contextsBeforeClose := len(browser.Contexts())
	if err := browser.Close(); err != nil {
		t.Fatalf("browser.Close returned error: %v", err)
	}
	if created := browser.NewContext(); created != nil {
		t.Fatal("expected closed browser to reject NewContext")
	}
	if got := len(browser.Contexts()); got != contextsBeforeClose {
		t.Fatalf("closed browser changed its context inventory: got %d, want %d", got, contextsBeforeClose)
	}
	if _, err := browser.NewPage(); err == nil || err.Error() != "browser is closed" {
		t.Fatalf("expected closed browser to reject NewPage, got %v", err)
	}
}

func TestBrowserLifecycleCloseIsIdempotent(t *testing.T) {
	browser := NewBrowser()
	context := browser.DefaultContext()

	for attempt := 1; attempt <= 2; attempt++ {
		if err := context.Close(); err != nil {
			t.Fatalf("context.Close attempt %d returned error: %v", attempt, err)
		}
		if err := browser.Close(); err != nil {
			t.Fatalf("browser.Close attempt %d returned error: %v", attempt, err)
		}
	}
	if !context.IsClosed() {
		t.Fatal("expected context to remain closed")
	}
	if !browser.IsClosed() {
		t.Fatal("expected browser to remain closed")
	}
}
