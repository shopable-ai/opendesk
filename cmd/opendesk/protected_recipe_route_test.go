package main

import "testing"

func TestProtectedRecipeRoutingDoesNotInterceptPlainJavaScript(t *testing.T) {
	if isAIProtectedRecipeInvocation([]string{"ai", "run", "recipe.js"}) {
		t.Fatal("plain ai run .js was intercepted by protected routing")
	}
	if got := directProtectedPackagePath([]string{"-script", "recipe.js"}); got != "" {
		t.Fatalf("plain direct .js was intercepted as %q", got)
	}
	if !isAIProtectedRecipeInvocation([]string{"ai", "run", "recipe.odpkg"}) {
		t.Fatal("protected ai run .odpkg was not recognized")
	}
	if got := directProtectedPackagePath([]string{"-script=recipe.odpkg"}); got != "recipe.odpkg" {
		t.Fatalf("direct protected package path = %q", got)
	}
}
