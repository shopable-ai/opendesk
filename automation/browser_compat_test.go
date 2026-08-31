package automation

import (
	"strconv"
	"testing"

	"github.com/dop251/goja"
)

func TestBrowserDefaultContextAndLegacyNewPage(t *testing.T) {
	browser := NewBrowser()
	if browser == nil {
		t.Fatal("expected browser")
	}
	if browser.DefaultContext() == nil {
		t.Fatal("expected default context")
	}
	page, err := browser.NewPage()
	if err != nil {
		t.Fatalf("NewPage returned error: %v", err)
	}
	if page == nil {
		t.Fatal("expected page")
	}
	if got := len(browser.Pages()); got != 1 {
		t.Fatalf("expected browser to track 1 page, got %d", got)
	}
	if got := len(browser.DefaultContext().Pages()); got != 1 {
		t.Fatalf("expected default context to track 1 page, got %d", got)
	}
}

func TestBrowserNewContextCreatesIsolatedContainer(t *testing.T) {
	browser := NewBrowser()
	ctxA := browser.NewContext()
	ctxB := browser.NewContext()

	if ctxA == ctxB {
		t.Fatal("expected distinct contexts")
	}

	if err := ctxA.SetStorage("token", "a"); err != nil {
		t.Fatalf("ctxA SetStorage returned error: %v", err)
	}
	if err := ctxA.SetSessionValue("session", "alpha"); err != nil {
		t.Fatalf("ctxA SetSessionValue returned error: %v", err)
	}
	if err := ctxA.SetCookies([]map[string]interface{}{{"name": "sid", "value": "1"}}); err != nil {
		t.Fatalf("ctxA SetCookies returned error: %v", err)
	}

	if got := ctxB.GetStorage("token"); got != nil {
		t.Fatalf("expected ctxB storage to stay isolated, got %v", got)
	}
	if got := ctxB.GetSessionValue("session"); got != nil {
		t.Fatalf("expected ctxB session to stay isolated, got %v", got)
	}
	if got := len(ctxB.Cookies()); got != 0 {
		t.Fatalf("expected ctxB cookies to stay isolated, got %d", got)
	}
}

func TestBrowserPagesAggregatesPagesAcrossContexts(t *testing.T) {
	browser := NewBrowser()
	ctxA := browser.DefaultContext()
	ctxB := browser.NewContext()

	if _, err := ctxA.NewPage(); err != nil {
		t.Fatalf("ctxA.NewPage returned error: %v", err)
	}
	if _, err := ctxB.NewPage(); err != nil {
		t.Fatalf("ctxB.NewPage returned error: %v", err)
	}

	pages := browser.Pages()
	if len(pages) != 2 {
		t.Fatalf("expected browser to aggregate 2 pages, got %d", len(pages))
	}
	if browser.LastPage() != pages[1] {
		t.Fatal("expected browser.LastPage to return the last registered page")
	}
}

func TestContextNewPageRegistersIntoBrowserAndContext(t *testing.T) {
	browser := NewBrowser()
	ctx := browser.NewContext()

	page, err := ctx.NewPage()
	if err != nil {
		t.Fatalf("NewPage returned error: %v", err)
	}
	if page == nil {
		t.Fatal("expected page")
	}
	if got := len(ctx.Pages()); got != 1 {
		t.Fatalf("expected context to track 1 page, got %d", got)
	}
	if got := len(browser.Pages()); got != 1 {
		t.Fatalf("expected browser to track 1 page, got %d", got)
	}
	if ctx.LastPage() != page {
		t.Fatal("expected context.LastPage to return the created page")
	}
	if browser.LastPage() != page {
		t.Fatal("expected browser.LastPage to return the created page")
	}
	if page.Context() != ctx {
		t.Fatalf("expected page owner context to be registered, got %#v", page.Context())
	}
	if page.Browser() != browser {
		t.Fatalf("expected page owner browser to be registered, got %#v", page.Browser())
	}
}

func TestContextCookiesStorageSessionCRUD(t *testing.T) {
	browser := NewBrowser()
	ctx := browser.NewContext()

	cookies := []map[string]interface{}{{"name": "sid", "value": "1"}}
	if err := ctx.SetCookies(cookies); err != nil {
		t.Fatalf("SetCookies returned error: %v", err)
	}
	if got := len(ctx.Cookies()); got != 1 {
		t.Fatalf("expected 1 cookie, got %d", got)
	}
	if err := ctx.ClearCookies(); err != nil {
		t.Fatalf("ClearCookies returned error: %v", err)
	}
	if got := len(ctx.Cookies()); got != 0 {
		t.Fatalf("expected cookies cleared, got %d", got)
	}

	if err := ctx.SetStorage("token", "abc"); err != nil {
		t.Fatalf("SetStorage returned error: %v", err)
	}
	if got := ctx.GetStorage("token"); got != "abc" {
		t.Fatalf("unexpected storage value: %v", got)
	}
	if err := ctx.ClearStorage(); err != nil {
		t.Fatalf("ClearStorage returned error: %v", err)
	}
	if got := ctx.GetStorage("token"); got != nil {
		t.Fatalf("expected storage cleared, got %v", got)
	}

	if err := ctx.SetSessionValue("room", "wechat"); err != nil {
		t.Fatalf("SetSessionValue returned error: %v", err)
	}
	if got := ctx.GetSessionValue("room"); got != "wechat" {
		t.Fatalf("unexpected session value: %v", got)
	}
	if err := ctx.ClearSession(); err != nil {
		t.Fatalf("ClearSession returned error: %v", err)
	}
	if got := ctx.GetSessionValue("room"); got != nil {
		t.Fatalf("expected session cleared, got %v", got)
	}
}

func TestBrowserContextSessionStorageAndCookies(t *testing.T) {
	browser := NewBrowser()
	ctx := browser.NewContext()
	if err := ctx.SetStorage("token", "abc"); err != nil {
		t.Fatalf("SetStorage returned error: %v", err)
	}
	if got := ctx.GetStorage("token"); got != "abc" {
		t.Fatalf("unexpected storage value: %v", got)
	}
	if err := ctx.SetSessionValue("room", "wechat"); err != nil {
		t.Fatalf("SetSessionValue returned error: %v", err)
	}
	if got := ctx.GetSessionValue("room"); got != "wechat" {
		t.Fatalf("unexpected session value: %v", got)
	}
	cookies := []map[string]interface{}{{"name": "sid", "value": "1"}}
	if err := ctx.SetCookies(cookies); err != nil {
		t.Fatalf("SetCookies returned error: %v", err)
	}
	if got := len(ctx.Cookies()); got != 1 {
		t.Fatalf("expected 1 cookie, got %d", got)
	}
}

func TestContextCloseBlocksFutureNewPageEvenIfBrowserStillOpen(t *testing.T) {
	browser := NewBrowser()
	ctx := browser.NewContext()

	if err := ctx.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}
	if !ctx.IsClosed() {
		t.Fatal("expected context to report closed state")
	}
	if _, err := ctx.NewPage(); err == nil || err.Error() != "context is closed" {
		t.Fatalf("expected context closed error, got %v", err)
	}
}

func TestBrowserCloseBlocksFutureNewPageAndContextPages(t *testing.T) {
	browser := NewBrowser()
	ctx := browser.NewContext()

	if err := browser.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}
	if !browser.IsClosed() {
		t.Fatal("expected browser to report closed state")
	}
	if _, err := browser.NewPage(); err == nil || err.Error() != "browser is closed" {
		t.Fatalf("expected browser closed error from browser.NewPage, got %v", err)
	}
	if _, err := ctx.NewPage(); err == nil || err.Error() != "browser is closed" {
		t.Fatalf("expected browser closed error from context.NewPage, got %v", err)
	}
}

func newRuntimeForFacadeTests(t *testing.T) *goja.Runtime {
	t.Helper()
	rt := goja.New()
	if err := InitJS(rt); err != nil {
		t.Fatalf("InitJS returned error: %v", err)
	}
	return rt
}

func exportedMapFromObject(t *testing.T, value goja.Value) map[string]interface{} {
	t.Helper()
	obj := value.ToObject(nil)
	result := map[string]interface{}{}
	for _, key := range obj.Keys() {
		result[key] = obj.Get(key).Export()
	}
	return result
}

func exportedArrayFromObject(t *testing.T, value goja.Value) []interface{} {
	t.Helper()
	obj := value.ToObject(nil)
	length := int(obj.Get("length").ToInteger())
	result := make([]interface{}, 0, length)
	for i := 0; i < length; i++ {
		result = append(result, obj.Get(strconv.Itoa(i)).Export())
	}
	return result
}

func TestInitJSInjectsLegacyRawHandles(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	for _, name := range []string{"page____Inject", "browser____Inject", "context____Inject"} {
		value := rt.Get(name)
		if goja.IsUndefined(value) || goja.IsNull(value) {
			t.Fatalf("expected %s to exist", name)
		}
	}
}

func TestApplyRuntimeStackModeLegacyKeepsPageDefault(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	if err := rt.Set("__legacyBefore", rt.Get("page")); err != nil {
		t.Fatalf("failed to seed legacy before handle: %v", err)
	}
	if err := ApplyRuntimeStackMode(rt, "legacy"); err != nil {
		t.Fatalf("ApplyRuntimeStackMode returned error: %v", err)
	}
	value, err := rt.RunString(`page === __legacyBefore`)
	if err != nil {
		t.Fatalf("legacy alias check failed: %v", err)
	}
	if !value.ToBoolean() {
		t.Fatal("expected legacy mode to keep original page object")
	}
}

func TestApplyRuntimeStackModeUpgradedAliasesPageFacade(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	if err := ApplyRuntimeStackMode(rt, "upgraded"); err != nil {
		t.Fatalf("ApplyRuntimeStackMode returned error: %v", err)
	}
	value, err := rt.RunString(`page === pageUpgraded && browser !== browserUpgraded`)
	if err != nil {
		t.Fatalf("alias check failed: %v", err)
	}
	if !value.ToBoolean() {
		t.Fatal("expected upgraded mode to alias page and keep legacy browser")
	}
}

func TestApplyRuntimeStackModePlaywrightAliasesAllFacades(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	if err := ApplyRuntimeStackMode(rt, "playwright"); err != nil {
		t.Fatalf("ApplyRuntimeStackMode returned error: %v", err)
	}
	value, err := rt.RunString(`page === pageUpgraded && browser === browserUpgraded && context === contextUpgraded`)
	if err != nil {
		t.Fatalf("playwright alias check failed: %v", err)
	}
	if !value.ToBoolean() {
		t.Fatal("expected playwright mode to alias page/browser/context to upgraded facades")
	}
}

func TestAutomationNamespaceExposesLegacyAndUpgradedHandles(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	if _, err := rt.RunString(`typeof Automation === 'object' && !!Automation.getLegacy && !!Automation.getUpgraded && !!Automation.getPlaywrightFacade`); err != nil {
		t.Fatalf("Automation namespace missing: %v", err)
	}
	value, err := rt.RunString(`({
	  legacyPageMatches: Automation.getLegacy().page === pageLegacy,
	  upgradedPageMatches: Automation.getUpgraded().page === pageUpgraded,
	  playwrightBrowserMatches: Automation.getPlaywrightFacade().browser === browserUpgraded
	})`)
	if err != nil {
		t.Fatalf("Automation namespace check failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["legacyPageMatches"] != true || result["upgradedPageMatches"] != true || result["playwrightBrowserMatches"] != true {
		t.Fatalf("unexpected namespace result: %#v", result)
	}
}

func TestUpgradedPageOpenRoutesToGotoOrOpenURL(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const basePage = {
		    goto(url) { calls.push(['goto', url]); },
		    openURL(url) { calls.push(['openURL', url]); }
		  };
		  const upgraded = Object.create(basePage);
		  upgraded.open = pageUpgraded.open;
		  upgraded.open('https://example.com');
		  delete basePage.openURL;
		  upgraded.open('https://fallback.example.com');
		  return calls;
		})()
	`)
	if err != nil {
		t.Fatalf("pageUpgraded.open failed: %v", err)
	}
	calls := exportedArrayFromObject(t, value)
	if len(calls) != 2 {
		t.Fatalf("expected 2 calls, got %d", len(calls))
	}
	first := calls[0].([]interface{})
	second := calls[1].([]interface{})
	if first[0] != "openURL" || second[0] != "goto" {
		t.Fatalf("unexpected route order: %#v", calls)
	}
}

func TestUpgradedPageLocatorReturnsSelectorHandle(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const locator = pageUpgraded.locator('#app');
		  return {
		    selector: locator.selector,
		    hasClick: typeof locator.click === 'function',
		    hasType: typeof locator.type === 'function',
		    hasPress: typeof locator.press === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("pageUpgraded.locator failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["selector"] != "#app" || result["hasClick"] != true || result["hasType"] != true || result["hasPress"] != true {
		t.Fatalf("unexpected locator payload: %#v", result)
	}
}

func TestUpgradedPageWaitForSupportsNumberAndSelectorRouting(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const basePage = {
		    waitFor(target, options) {
		      calls.push({ kind: 'waitFor', target, options });
		      return 'legacy';
		    },
		    waitForSelector(selector, options) {
		      calls.push({ kind: 'waitForSelector', selector, options });
		      return 'selector';
		    }
		  };
		  const upgraded = Object.create(basePage);
		  upgraded.waitFor = pageUpgraded.waitFor;
		  upgraded.waitForSelector = pageUpgraded.waitForSelector;
		  upgraded.waitFor(15);
		  upgraded.waitFor('#app', { timeout: 12 });
		  upgraded.waitForSelector('#other', { timeout: 22 });
		  return calls;
		})()
	`)
	if err != nil {
		t.Fatalf("pageUpgraded.waitFor failed: %v", err)
	}
	calls := exportedArrayFromObject(t, value)
	if len(calls) != 3 {
		t.Fatalf("expected 3 calls, got %d", len(calls))
	}
	first := calls[0].(map[string]interface{})
	second := calls[1].(map[string]interface{})
	third := calls[2].(map[string]interface{})
	if first["kind"] != "waitFor" {
		t.Fatalf("expected first call to use waitFor, got %#v", first)
	}
	if second["kind"] != "waitForSelector" {
		t.Fatalf("expected selector wait to route to waitForSelector, got %#v", second)
	}
	if third["kind"] != "waitForSelector" {
		t.Fatalf("expected explicit waitForSelector to route to waitForSelector, got %#v", third)
	}
}

func TestUpgradedPageGetBrowserGetContextGetPage(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const ownerBrowser = { marker: 'browser-owner' };
		  const ownerContext = { marker: 'context-owner' };
		  const ownerPage = { Browser() { return ownerBrowser; }, Context() { return ownerContext; } };
		  const derived = Object.create(ownerPage);
		  derived.getBrowser = pageUpgraded.getBrowser;
		  derived.getContext = pageUpgraded.getContext;
		  derived.getPage = pageUpgraded.getPage;
		  const browserHandle = derived.getBrowser();
		  const contextHandle = derived.getContext();
		  return {
		    browserMatchesOwner: browserHandle === ownerBrowser,
		    contextMatchesOwner: contextHandle === ownerContext,
		    pageMatchesSelf: derived.getPage() === derived,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("pageUpgraded getters failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["browserMatchesOwner"] != true || result["contextMatchesOwner"] != true || result["pageMatchesSelf"] != true {
		t.Fatalf("unexpected getter result: %#v", result)
	}
}

func TestUpgradedPageCookiesStorageSessionRouteToContext(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  pageUpgraded.cookies([{ name: 'sid', value: '1' }]);
		  const cookies = pageUpgraded.cookies();
		  pageUpgraded.storage('token', 'abc');
		  const storageValue = pageUpgraded.storage('token');
		  const storageSnapshot = pageUpgraded.storage();
		  pageUpgraded.session({ room: 'wechat' });
		  const sessionValue = pageUpgraded.session('room');
		  const sessionSnapshot = pageUpgraded.session();
		  return {
		    cookieCount: cookies.length,
		    cookieName: cookies[0].name,
		    storageValue,
		    storageSnapshot,
		    sessionValue,
		    sessionSnapshot,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("context container routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["cookieCount"] != int64(1) && result["cookieCount"] != 1 {
		t.Fatalf("unexpected cookie count: %#v", result)
	}
	if result["cookieName"] != "sid" {
		t.Fatalf("unexpected cookie name: %#v", result)
	}
	if result["storageValue"] != "abc" {
		t.Fatalf("unexpected storage value: %#v", result)
	}
	storageSnapshot := result["storageSnapshot"].(map[string]interface{})
	if storageSnapshot["token"] != "abc" {
		t.Fatalf("unexpected storage snapshot: %#v", storageSnapshot)
	}
	sessionSnapshot := result["sessionSnapshot"].(map[string]interface{})
	if result["sessionValue"] != "wechat" || sessionSnapshot["room"] != "wechat" {
		t.Fatalf("unexpected session snapshot: %#v", result)
	}
}

func TestPlaywrightChromiumLaunchReturnsBrowserFacade(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const browserHandle = playwright.chromium.launch();
		  return {
		    hasNewContext: typeof browserHandle.newContext === 'function',
		    hasGetContext: typeof browserHandle.getContext === 'function',
		    hasGetPage: typeof browserHandle.getPage === 'function',
		    hasClose: typeof browserHandle.close === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("playwright.chromium.launch failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["hasNewContext"] != true || result["hasGetContext"] != true || result["hasGetPage"] != true || result["hasClose"] != true {
		t.Fatalf("unexpected browser facade payload: %#v", result)
	}
}

func TestPlaywrightLaunchNewContextWorks(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const browserHandle = playwright.chromium.launch();
		  const contextHandle = browserHandle.newContext();
		  return {
		    hasNewPage: typeof contextHandle.newPage === 'function',
		    hasClose: typeof contextHandle.close === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("playwright newContext failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["hasNewPage"] != true || result["hasClose"] != true {
		t.Fatalf("unexpected context facade payload: %#v", result)
	}
}

func TestPlaywrightContextNewPageWorks(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const browserHandle = playwright.chromium.launch();
		  const contextHandle = browserHandle.newContext();
		  const pageHandle = contextHandle.newPage();
		  return {
		    hasLocator: typeof pageHandle.locator === 'function',
		    hasWaitForSelector: typeof pageHandle.waitForSelector === 'function',
		    hasEvaluate: typeof pageHandle.evaluate === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("playwright context.newPage failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["hasLocator"] != true || result["hasWaitForSelector"] != true || result["hasEvaluate"] != true {
		t.Fatalf("unexpected page facade payload: %#v", result)
	}
}

func TestPlaywrightFacadeCloseMethodsExist(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const browserHandle = playwright.chromium.launch();
		  const contextHandle = browserHandle.newContext();
		  const pageHandle = contextHandle.newPage();
		  return {
		    browserClose: typeof browserHandle.close === 'function',
		    contextClose: typeof contextHandle.close === 'function',
		    pageClose: typeof pageHandle.close === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("playwright close method check failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["browserClose"] != true || result["contextClose"] != true || result["pageClose"] != true {
		t.Fatalf("unexpected close method payload: %#v", result)
	}
}

func TestPlaywrightLaunchWithURLRoutesThroughBrowserOpen(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const originalBrowser = globalThis.browserUpgraded;
		  globalThis.browserUpgraded = {
		    open(options) {
		      calls.push(options);
		      return { newPage() {}, close() {} };
		    },
		    newContext() { return globalThis.contextUpgraded; },
		    getContext() { return globalThis.contextUpgraded; },
		    getPage() { return globalThis.pageUpgraded; },
		    close() { return 'browser-closed'; },
		  };
		  const handle = playwright.chromium.launch({ url: 'https://example.com', appName: 'Safari' });
		  globalThis.browserUpgraded = originalBrowser;
		  return {
		    callCount: calls.length,
		    firstUrl: calls[0] && calls[0].url,
		    firstAppName: calls[0] && calls[0].appName,
		    hasNewContext: typeof handle.newContext === 'function',
		    hasGetPage: typeof handle.getPage === 'function',
		    hasClose: typeof handle.close === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("playwright launch URL routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["callCount"] != int64(1) && result["callCount"] != 1 {
		t.Fatalf("unexpected browser.open call count: %#v", result)
	}
	if result["firstUrl"] != "https://example.com" || result["firstAppName"] != "Safari" {
		t.Fatalf("unexpected launch routing payload: %#v", result)
	}
	if result["hasNewContext"] != true || result["hasGetPage"] != true || result["hasClose"] != true {
		t.Fatalf("unexpected launch handle payload: %#v", result)
	}
}

func TestUpgradedPageActionMethodsRouteToUnderlyingPageOrKeyboard(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const basePage = {
		    click(target, options) {
		      calls.push({ kind: 'click', target, options });
		      return 'clicked';
		    },
		    type(target, text, options) {
		      calls.push({ kind: 'type', target, text, options });
		      return 'typed';
		    },
		    press(target, key, options) {
		      calls.push({ kind: 'press', target, key, options });
		      return 'pressed';
		    },
		    evaluate(fn, ...args) {
		      calls.push({ kind: 'evaluate', args });
		      return fn(...args);
		    }
		  };
		  const upgraded = Object.create(basePage);
		  upgraded.click = pageUpgraded.click;
		  upgraded.type = pageUpgraded.type;
		  upgraded.press = pageUpgraded.press;
		  upgraded.evaluate = pageUpgraded.evaluate;

		  const originalKeyboard = globalThis.keyboard;
		  globalThis.keyboard = {
		    type(text) { calls.push({ kind: 'keyboard.type', text }); },
		    press(key) { calls.push({ kind: 'keyboard.press', key }); },
		  };

		  upgraded.click('#cta', { button: 'left' });
		  upgraded.type('#name', 'alice', { delay: 12 });
		  upgraded.press('#name', 'Enter', { timeout: 5 });
		  delete basePage.type;
		  delete basePage.press;
		  upgraded.type('fallback text');
		  upgraded.press('Escape');
		  const evaluated = upgraded.evaluate((selector, suffix) => selector + suffix, '#name', '-ok');
		  globalThis.keyboard = originalKeyboard;
		  return { calls, evaluated };
		})()
	`)
	if err != nil {
		t.Fatalf("pageUpgraded action routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["evaluated"] != "#name-ok" {
		t.Fatalf("unexpected evaluate result: %#v", result)
	}
	routed := exportedArrayFromObject(t, value.ToObject(rt).Get("calls"))
	if len(routed) != 6 {
		t.Fatalf("expected 6 routed calls, got %d", len(routed))
	}
	first := routed[0].(map[string]interface{})
	second := routed[1].(map[string]interface{})
	third := routed[2].(map[string]interface{})
	fourth := routed[3].(map[string]interface{})
	fifth := routed[4].(map[string]interface{})
	sixth := routed[5].(map[string]interface{})
	if first["kind"] != "click" || first["target"] != "#cta" {
		t.Fatalf("unexpected click route: %#v", first)
	}
	if second["kind"] != "type" || second["text"] != "alice" {
		t.Fatalf("unexpected type route: %#v", second)
	}
	if third["kind"] != "press" || third["key"] != "Enter" {
		t.Fatalf("unexpected press route: %#v", third)
	}
	if fourth["kind"] != "keyboard.type" || fourth["text"] != "fallback text" {
		t.Fatalf("unexpected keyboard type fallback: %#v", fourth)
	}
	if fifth["kind"] != "keyboard.press" || fifth["key"] != "Escape" {
		t.Fatalf("unexpected keyboard press fallback: %#v", fifth)
	}
	if sixth["kind"] != "evaluate" {
		t.Fatalf("unexpected evaluate route: %#v", sixth)
	}
}

func TestUpgradedPageEvaluateReturnsExplicitLocalCompatibilityResultWhenNoRuntimeEvaluateExists(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const upgraded = Object.create({});
		  upgraded.evaluate = pageUpgraded.evaluate;
		  return upgraded.evaluate((selector, suffix) => selector + suffix, '#name', '-local');
		})()
	`)
	if err != nil {
		t.Fatalf("local compatibility evaluate probe failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["mode"] != "local-compatibility-evaluate" || result["value"] != "#name-local" {
		t.Fatalf("unexpected local compatibility evaluate result: %#v", result)
	}
}

func TestLocatorRoutesActionsToOwningPage(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const owner = {
		    click(target, options) { calls.push({ kind: 'click', target, options }); },
		    type(target, text, options) { calls.push({ kind: 'type', target, text, options }); },
		    press(target, key, options) { calls.push({ kind: 'press', target, key, options }); },
		    waitForSelector(target, options) { calls.push({ kind: 'waitForSelector', target, options }); },
		    evaluate(fn, ...args) {
		      calls.push({ kind: 'evaluate', args });
		      return fn(...args);
		    }
		  };
		  owner.locator = pageUpgraded.locator;
		  const locator = owner.locator('#save');
		  locator.click({ timeout: 11 });
		  locator.type('hello', { delay: 2 });
		  locator.press('Enter', { timeout: 3 });
		  locator.waitFor({ timeout: 44 });
		  const evaluated = locator.evaluate((selector, suffix) => selector + suffix, '-ready');
		  return { calls, evaluated, selector: locator.selector };
		})()
	`)
	if err != nil {
		t.Fatalf("locator routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["selector"] != "#save" || result["evaluated"] != "#save-ready" {
		t.Fatalf("unexpected locator result: %#v", result)
	}
	routed := exportedArrayFromObject(t, value.ToObject(rt).Get("calls"))
	if len(routed) != 5 {
		t.Fatalf("expected 5 locator calls, got %d", len(routed))
	}
	click := routed[0].(map[string]interface{})
	typeCall := routed[1].(map[string]interface{})
	press := routed[2].(map[string]interface{})
	waitFor := routed[3].(map[string]interface{})
	evaluate := routed[4].(map[string]interface{})
	if click["target"] != "#save" || typeCall["target"] != "#save" || press["target"] != "#save" || waitFor["target"] != "#save" {
		t.Fatalf("locator did not preserve selector routing: %#v", routed)
	}
	if waitFor["kind"] != "waitForSelector" {
		t.Fatalf("locator waitFor did not route to waitForSelector: %#v", waitFor)
	}
	if evaluate["kind"] != "evaluate" {
		t.Fatalf("locator evaluate did not route: %#v", evaluate)
	}
}

func TestUpgradedBrowserAndContextGettersAndCloseRouteToFacades(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const contextBase = {
		    closed: 0,
		    isClosed: false,
		    Close() { this.closed += 1; this.isClosed = true; return 'context-closed'; },
		    IsClosed() { return this.isClosed; }
		  };
		  const browserBase = {
		    closed: 0,
		    isClosed: false,
		    DefaultContext() { return contextBase; },
		    Pages() { return []; },
		    Close() { this.closed += 1; this.isClosed = true; return 'browser-closed'; },
		    IsClosed() { return this.isClosed; }
		  };
		  const newContextHandle = browserUpgraded.newContext.call(browserBase);
		  const pageFallback = browserUpgraded.getPage.call(browserBase);
		  const browserContext = browserUpgraded.getContext.call(browserBase);
		  const ownerPage = {
		    Browser() { return browserBase; },
		    Context() { return contextBase; }
		  };
		  ownerPage.getBrowser = pageUpgraded.getBrowser;
		  ownerPage.getContext = pageUpgraded.getContext;
		  ownerPage.close = pageUpgraded.close;
		  const pageContext = ownerPage.getContext();
		  const pageBrowser = ownerPage.getBrowser();
		  const pageCloseResult = ownerPage.close();
		  const contextPage = browserContext.getPage();
		  const contextCloseResult = browserContext.close();
		  const browserCloseResult = browserUpgraded.close.call(browserBase);
		  return {
		    newContextHasNewPage: typeof newContextHandle.newPage === 'function',
		    pageFallbackIsFacade: pageFallback === pageUpgraded,
		    browserContextHasGetBrowser: typeof browserContext.getBrowser === 'function',
		    browserContextHasGetPage: typeof browserContext.getPage === 'function',
		    pageContextHasClose: typeof pageContext.close === 'function',
		    pageBrowserIsOwner: pageBrowser === browserBase,
		    contextPageIsFacade: contextPage === pageUpgraded,
		    pageCloseResult,
		    contextCloseResult,
		    browserCloseResult,
		    contextClosedCount: contextBase.closed,
		    browserClosedCount: browserBase.closed,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("browser/context getter routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	for _, key := range []string{"newContextHasNewPage", "pageFallbackIsFacade", "browserContextHasGetBrowser", "browserContextHasGetPage", "pageContextHasClose", "pageBrowserIsOwner", "contextPageIsFacade"} {
		if result[key] != true {
			t.Fatalf("expected %s to be true, got %#v", key, result)
		}
	}
	if result["pageCloseResult"] != "context-closed" || result["contextCloseResult"] != "context-closed" || result["browserCloseResult"] != "browser-closed" {
		t.Fatalf("unexpected close results: %#v", result)
	}
	if result["contextClosedCount"] != int64(2) && result["contextClosedCount"] != 2 {
		t.Fatalf("unexpected context close count: %#v", result)
	}
	if result["browserClosedCount"] != int64(1) && result["browserClosedCount"] != 1 {
		t.Fatalf("unexpected browser close count: %#v", result)
	}
}

func TestUpgradedBrowserPagesReturnsFacadeListAndFallback(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const pageA = { id: 'page-a', evaluate(fn, ...args) { return fn(...args); } };
		  const pageB = { id: 'page-b', evaluate(fn, ...args) { return fn(...args); } };
		  const browserBase = {
		    Pages() { return [pageA, pageB]; }
		  };
		  const routedPages = browserUpgraded.pages.call(browserBase);
		  const fallbackPages = browserUpgraded.pages.call({ Pages() { return null; } });
		  return {
		    routedLength: routedPages.length,
		    routedFirstId: routedPages[0].id,
		    routedSecondId: routedPages[1].id,
		    routedFirstIsFacade: routedPages[0] !== pageA && typeof routedPages[0].locator === 'function',
		    routedSecondEvaluate: routedPages[1].evaluate((suffix) => routedPages[1].id + suffix, '-ok'),
		    fallbackLength: fallbackPages.length,
		    fallbackFirstIsPageFacade: fallbackPages[0] === pageUpgraded,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("browserUpgraded.pages failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["routedLength"] != int64(2) && result["routedLength"] != 2 {
		t.Fatalf("unexpected routed length: %#v", result)
	}
	if result["routedFirstId"] != "page-a" || result["routedSecondId"] != "page-b" {
		t.Fatalf("unexpected routed page ids: %#v", result)
	}
	if result["routedFirstIsFacade"] != true {
		t.Fatalf("expected first routed page to be upgraded facade: %#v", result)
	}
	if result["routedSecondEvaluate"] != "page-b-ok" {
		t.Fatalf("unexpected evaluate result from routed page: %#v", result)
	}
	if result["fallbackLength"] != int64(1) && result["fallbackLength"] != 1 {
		t.Fatalf("unexpected fallback length: %#v", result)
	}
	if result["fallbackFirstIsPageFacade"] != true {
		t.Fatalf("expected fallback page list to contain pageUpgraded: %#v", result)
	}
}

func TestFacadeCloseMethodsRemainCallableAfterFirstClose(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const contextBase = {
		    closed: 0,
		    isClosed: false,
		    Close() { this.closed += 1; this.isClosed = true; return this.closed; },
		    IsClosed() { return this.isClosed; }
		  };
		  const browserBase = {
		    closed: 0,
		    isClosed: false,
		    Close() { this.closed += 1; this.isClosed = true; return this.closed; },
		    IsClosed() { return this.isClosed; }
		  };
		  const pageResults = [pageUpgraded.close.call({ getContext() { return contextBase; } }), pageUpgraded.close.call({ getContext() { return contextBase; } })];
		  const contextResults = [contextUpgraded.close.call(contextBase), contextUpgraded.close.call(contextBase)];
		  const browserResults = [browserUpgraded.close.call(browserBase), browserUpgraded.close.call(browserBase)];
		  return {
		    pageResults,
		    contextResults,
		    browserResults,
		    contextClosedCount: contextBase.closed,
		    browserClosedCount: browserBase.closed,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("repeat close routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	pageResults := exportedArrayFromObject(t, value.ToObject(rt).Get("pageResults"))
	contextResults := exportedArrayFromObject(t, value.ToObject(rt).Get("contextResults"))
	browserResults := exportedArrayFromObject(t, value.ToObject(rt).Get("browserResults"))
	if len(pageResults) != 2 || len(contextResults) != 2 || len(browserResults) != 2 {
		t.Fatalf("unexpected close result lengths: %#v", result)
	}
	if pageResults[0] != int64(1) || pageResults[1] != int64(2) {
		t.Fatalf("unexpected page close delegation results: %#v", pageResults)
	}
	if contextResults[0] != int64(3) || contextResults[1] != int64(4) {
		t.Fatalf("unexpected context close delegation results: %#v", contextResults)
	}
	if browserResults[0] != int64(1) || browserResults[1] != int64(2) {
		t.Fatalf("unexpected browser close delegation results: %#v", browserResults)
	}
	if result["contextClosedCount"] != int64(4) && result["contextClosedCount"] != 4 {
		t.Fatalf("unexpected context close count: %#v", result)
	}
	if result["browserClosedCount"] != int64(2) && result["browserClosedCount"] != 2 {
		t.Fatalf("unexpected browser close count: %#v", result)
	}
}

func TestUpgradedBrowserAndContextExposeClosedStateIntrospection(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const contextBase = {
		    closed: 0,
		    isClosed: false,
		    Close() { this.closed += 1; this.isClosed = true; return 'context-closed'; },
		    IsClosed() { return this.isClosed; }
		  };
		  const browserBase = {
		    closed: 0,
		    isClosed: false,
		    DefaultContext() { return contextBase; },
		    Close() { this.closed += 1; this.isClosed = true; return 'browser-closed'; },
		    IsClosed() { return this.isClosed; }
		  };
		  const browserBefore = browserUpgraded.isClosed.call(browserBase);
		  const contextBefore = contextUpgraded.isClosed.call(contextBase);
		  const browserCloseResult = browserUpgraded.close.call(browserBase);
		  const contextCloseResult = contextUpgraded.close.call(contextBase);
		  const browserAfter = browserUpgraded.isClosed.call(browserBase);
		  const contextAfter = contextUpgraded.isClosed.call(contextBase);
		  const launchHandle = playwright.chromium.launch();
		  return {
		    browserBefore,
		    contextBefore,
		    browserCloseResult,
		    contextCloseResult,
		    browserAfter,
		    contextAfter,
		    launchHandleHasIsClosed: typeof launchHandle.isClosed === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("closed-state introspection routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["browserBefore"] != false || result["contextBefore"] != false {
		t.Fatalf("expected initial closed state to be false: %#v", result)
	}
	if result["browserAfter"] != true || result["contextAfter"] != true {
		t.Fatalf("expected closed state to become true after close: %#v", result)
	}
	if result["browserCloseResult"] != "browser-closed" || result["contextCloseResult"] != "context-closed" {
		t.Fatalf("unexpected close results: %#v", result)
	}
	if result["launchHandleHasIsClosed"] != true {
		t.Fatalf("expected playwright launch handle to expose isClosed: %#v", result)
	}
}

func TestUpgradedBrowserAndContextClosedStateFallbackToBooleanFields(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => ({
		  browserClosed: browserUpgraded.isClosed.call({ closed: true }),
		  contextClosed: contextUpgraded.isClosed.call({ isClosed: true }),
		  browserOpen: browserUpgraded.isClosed.call({ closed: false }),
		  contextOpen: contextUpgraded.isClosed.call({ isClosed: false }),
		}))()
	`)
	if err != nil {
		t.Fatalf("closed-state boolean fallback probe failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["browserClosed"] != true || result["contextClosed"] != true {
		t.Fatalf("expected closed boolean fallback to report true: %#v", result)
	}
	if result["browserOpen"] != false || result["contextOpen"] != false {
		t.Fatalf("expected open boolean fallback to report false: %#v", result)
	}
}

func TestUpgradedBrowserNewContextRejectsClosedBrowserAtFacadeBoundary(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const browserBase = {
		    closed: true,
		    newContextCalls: 0,
		    NewContext() { this.newContextCalls += 1; return { marker: 'unexpected' }; },
		    IsClosed() { return true; }
		  };
		  try {
		    browserUpgraded.newContext.call(browserBase);
		    return { ok: true, newContextCalls: browserBase.newContextCalls };
		  } catch (err) {
		    return { ok: false, message: String(err && err.message ? err.message : err), newContextCalls: browserBase.newContextCalls };
		  }
		})()
	`)
	if err != nil {
		t.Fatalf("closed browser newContext guard failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["ok"] != false {
		t.Fatalf("expected closed browser newContext to fail: %#v", result)
	}
	if result["message"] != "browser is closed" {
		t.Fatalf("unexpected closed browser error: %#v", result)
	}
	if result["newContextCalls"] != int64(0) && result["newContextCalls"] != 0 {
		t.Fatalf("expected facade guard to prevent NewContext call: %#v", result)
	}
}

func TestUpgradedBrowserOpenRoutesURLThroughPageFacade(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const originalPage = globalThis.page;
		  globalThis.page = {
		    open(url, options) {
		      calls.push({ url, options });
		      return 'opened';
		    }
		  };
		  const contextBase = { marker: 'ctx' };
		  const browserBase = {
		    DefaultContext() { return contextBase; }
		  };
		  const result = browserUpgraded.open.call(browserBase, { url: 'https://example.com', appName: 'Safari' });
		  globalThis.page = originalPage;
		  return {
		    callCount: calls.length,
		    firstUrl: calls[0] && calls[0].url,
		    firstAppName: calls[0] && calls[0].options && calls[0].options.appName,
		    returnedHasNewPage: !!result && typeof result.newPage === 'function',
		    returnedHasClose: !!result && typeof result.close === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("browserUpgraded.open routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["callCount"] != int64(1) && result["callCount"] != 1 {
		t.Fatalf("unexpected open call count: %#v", result)
	}
	if result["firstUrl"] != "https://example.com" || result["firstAppName"] != "Safari" {
		t.Fatalf("unexpected browser.open routing payload: %#v", result)
	}
	if result["returnedHasNewPage"] != true || result["returnedHasClose"] != true {
		t.Fatalf("expected browser.open to return context facade: %#v", result)
	}
}

func TestLocatorScreenshotRoutesToOwningPage(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const owner = {
		    screenshot(options) {
		      calls.push({ kind: 'screenshot', options });
		      return 'image-bytes';
		    }
		  };
		  owner.locator = pageUpgraded.locator;
		  const locator = owner.locator('#panel');
		  const result = locator.screenshot({ path: '/tmp/panel.png' });
		  return {
		    selector: locator.selector,
		    result,
		    callCount: calls.length,
		    screenshotPath: calls[0] && calls[0].options && calls[0].options.path,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("locator screenshot routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["selector"] != "#panel" || result["result"] != "image-bytes" {
		t.Fatalf("unexpected locator screenshot result: %#v", result)
	}
	if result["callCount"] != int64(1) && result["callCount"] != 1 {
		t.Fatalf("unexpected screenshot call count: %#v", result)
	}
	if result["screenshotPath"] != "/tmp/panel.png" {
		t.Fatalf("unexpected screenshot routing payload: %#v", result)
	}
}

func TestLocatorOwnerSurvivesPrototypeShadowing(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const basePage = {
		    click(target, options) { calls.push({ kind: 'click', target, options }); },
		    waitForSelector(target, options) { calls.push({ kind: 'waitForSelector', target, options }); },
		    evaluate(fn, ...args) { calls.push({ kind: 'evaluate', args }); return fn(...args); },
		    screenshot(options) { calls.push({ kind: 'screenshot', options }); return 'snap'; },
		  };
		  const derivedPage = Object.create(basePage);
		  derivedPage.locator = pageUpgraded.locator;
		  derivedPage.waitFor = pageUpgraded.waitFor;
		  const locator = derivedPage.locator('#shadow');
		  delete derivedPage.waitFor;
		  locator.click({ timeout: 7 });
		  locator.waitFor({ timeout: 8 });
		  const evaluated = locator.evaluate((selector, suffix) => selector + suffix, '-ok');
		  const screenshot = locator.screenshot({ path: '/tmp/shadow.png' });
		  return {
		    selector: locator.selector,
		    evaluated,
		    screenshot,
		    calls,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("locator prototype shadowing routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["selector"] != "#shadow" || result["evaluated"] != "#shadow-ok" || result["screenshot"] != "snap" {
		t.Fatalf("unexpected locator prototype-shadowing result: %#v", result)
	}
	routed := exportedArrayFromObject(t, value.ToObject(rt).Get("calls"))
	if len(routed) != 4 {
		t.Fatalf("expected 4 routed calls, got %d", len(routed))
	}
	for i, kind := range []string{"click", "waitForSelector", "evaluate", "screenshot"} {
		entry := routed[i].(map[string]interface{})
		if entry["kind"] != kind {
			t.Fatalf("unexpected routed kind at %d: %#v", i, entry)
		}
	}
	if routed[0].(map[string]interface{})["target"] != "#shadow" || routed[1].(map[string]interface{})["target"] != "#shadow" {
		t.Fatalf("expected selector preserved through prototype shadowing: %#v", routed)
	}
	if routed[3].(map[string]interface{})["options"].(map[string]interface{})["path"] != "/tmp/shadow.png" {
		t.Fatalf("unexpected screenshot path under prototype shadowing: %#v", routed[3])
	}
}

func TestUpgradedPageSupportsUpperCamelFallbackMethods(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const basePage = {
		    OpenURL(url) { calls.push({ kind: 'OpenURL', url }); return 'opened'; },
		    WaitForSelector(selector, options) { calls.push({ kind: 'WaitForSelector', selector, options }); return 'waited-selector'; },
		    Click(target, options) { calls.push({ kind: 'Click', target, options }); return 'clicked'; },
		    Type(target, text, options) { calls.push({ kind: 'Type', target, text, options }); return 'typed'; },
		    Press(target, key, options) { calls.push({ kind: 'Press', target, key, options }); return 'pressed'; },
		    Evaluate(fn, ...args) { calls.push({ kind: 'Evaluate', args }); return fn(...args); },
		  };
		  const upgraded = Object.create(basePage);
		  upgraded.open = pageUpgraded.open;
		  upgraded.waitFor = pageUpgraded.waitFor;
		  upgraded.waitForSelector = pageUpgraded.waitForSelector;
		  upgraded.click = pageUpgraded.click;
		  upgraded.type = pageUpgraded.type;
		  upgraded.press = pageUpgraded.press;
		  upgraded.evaluate = pageUpgraded.evaluate;
		  const openResult = upgraded.open('https://example.com');
		  const waitResult = upgraded.waitFor('#app', { timeout: 9 });
		  const waitSelectorResult = upgraded.waitForSelector('#dialog', { timeout: 10 });
		  const clickResult = upgraded.click('#cta', { button: 'left' });
		  const typeResult = upgraded.type('#name', 'alice', { delay: 4 });
		  const pressResult = upgraded.press('#name', 'Enter', { timeout: 6 });
		  const evaluateResult = upgraded.evaluate((selector, suffix) => selector + suffix, '#name', '-ok');
		  return { openResult, waitResult, waitSelectorResult, clickResult, typeResult, pressResult, evaluateResult, calls };
		})()
	`)
	if err != nil {
		t.Fatalf("UpperCamel page fallback failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["openResult"] != "opened" || result["waitResult"] != "waited-selector" || result["waitSelectorResult"] != "waited-selector" {
		t.Fatalf("unexpected wait/open result payload: %#v", result)
	}
	if result["clickResult"] != "clicked" || result["typeResult"] != "typed" || result["pressResult"] != "pressed" || result["evaluateResult"] != "#name-ok" {
		t.Fatalf("unexpected action result payload: %#v", result)
	}
	routed := exportedArrayFromObject(t, value.ToObject(rt).Get("calls"))
	if len(routed) != 7 {
		t.Fatalf("expected 7 routed calls, got %d", len(routed))
	}
	for i, kind := range []string{"OpenURL", "WaitForSelector", "WaitForSelector", "Click", "Type", "Press", "Evaluate"} {
		entry := routed[i].(map[string]interface{})
		if entry["kind"] != kind {
			t.Fatalf("unexpected UpperCamel route at %d: %#v", i, entry)
		}
	}
}

func TestLocatorSupportsUpperCamelOwningPageMethods(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const calls = [];
		  const owner = {
		    Click(target, options) { calls.push({ kind: 'Click', target, options }); return 'clicked'; },
		    Type(target, text, options) { calls.push({ kind: 'Type', target, text, options }); return 'typed'; },
		    Press(target, key, options) { calls.push({ kind: 'Press', target, key, options }); return 'pressed'; },
		    WaitForSelector(target, options) { calls.push({ kind: 'WaitForSelector', target, options }); return 'waited'; },
		    Screenshot(options) { calls.push({ kind: 'Screenshot', options }); return 'image'; },
		    Evaluate(fn, ...args) { calls.push({ kind: 'Evaluate', args }); return fn(...args); },
		  };
		  owner.locator = pageUpgraded.locator;
		  const locator = owner.locator('#caps');
		  return {
		    clickResult: locator.click({ timeout: 1 }),
		    typeResult: locator.type('hello', { delay: 2 }),
		    pressResult: locator.press('Enter', { timeout: 3 }),
		    waitResult: locator.waitFor({ timeout: 4 }),
		    screenshotResult: locator.screenshot({ path: '/tmp/caps.png' }),
		    evaluateResult: locator.evaluate((selector, suffix) => selector + suffix, '-ok'),
		    calls,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("locator UpperCamel routing failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["clickResult"] != "clicked" || result["typeResult"] != "typed" || result["pressResult"] != "pressed" || result["waitResult"] != "waited" || result["screenshotResult"] != "image" || result["evaluateResult"] != "#caps-ok" {
		t.Fatalf("unexpected locator UpperCamel result: %#v", result)
	}
	routed := exportedArrayFromObject(t, value.ToObject(rt).Get("calls"))
	if len(routed) != 6 {
		t.Fatalf("expected 6 UpperCamel locator calls, got %d", len(routed))
	}
	for i, kind := range []string{"Click", "Type", "Press", "WaitForSelector", "Screenshot", "Evaluate"} {
		entry := routed[i].(map[string]interface{})
		if entry["kind"] != kind {
			t.Fatalf("unexpected locator UpperCamel route at %d: %#v", i, entry)
		}
	}
}

func TestUpgradedPageWaitForAndActionErrorsStayExplicitWhenMethodsMissing(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const upgraded = Object.create({});
		  upgraded.waitFor = pageUpgraded.waitFor;
		  upgraded.waitForSelector = pageUpgraded.waitForSelector;
		  upgraded.click = pageUpgraded.click;
		  upgraded.evaluate = pageUpgraded.evaluate;
		  const errors = {};
		  try { upgraded.waitFor(12); } catch (err) { errors.waitForNumber = String(err.message || err); }
		  try { upgraded.waitForSelector('#missing'); } catch (err) { errors.waitForSelector = String(err.message || err); }
		  try { upgraded.waitFor('#missing'); } catch (err) { errors.waitForString = String(err.message || err); }
		  try { upgraded.click('#missing'); } catch (err) { errors.click = String(err.message || err); }
		  try { upgraded.evaluate('not-a-function'); } catch (err) { errors.evaluate = String(err.message || err); }
		  return errors;
		})()
	`)
	if err != nil {
		t.Fatalf("missing-method error contract probe failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["waitForNumber"] != "page.waitFor is not available" {
		t.Fatalf("unexpected waitFor number error: %#v", result)
	}
	if result["waitForSelector"] != "page.waitFor selector routing is not supported by current runtime" {
		t.Fatalf("unexpected waitForSelector error: %#v", result)
	}
	if result["waitForString"] != "page.waitFor selector routing is not supported by current runtime" {
		t.Fatalf("unexpected waitFor string error: %#v", result)
	}
	if result["click"] != "page.click is not supported by current runtime" {
		t.Fatalf("unexpected click error: %#v", result)
	}
	if result["evaluate"] != "page.evaluate is not supported by current runtime" {
		t.Fatalf("unexpected evaluate error: %#v", result)
	}
}

func TestUpgradedBrowserAndContextSupportUpperCamelBoundariesAndFallbacks(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	value, err := rt.RunString(`
		(() => {
		  const pageA = { id: 'page-a', Evaluate(fn, ...args) { return fn(...args); } };
		  const pageB = { id: 'page-b', Evaluate(fn, ...args) { return fn(...args); } };
		  const contextBase = {
		    closed: 0,
		    NewPage() { return pageB; },
		    LastPage() { return pageA; },
		    Close() { this.closed += 1; return 'context-closed'; },
		  };
		  const browserBase = {
		    closed: 0,
		    NewContext() { return contextBase; },
		    DefaultContext() { return contextBase; },
		    LastPage() { return pageA; },
		    Pages() { return null; },
		    Close() { this.closed += 1; return 'browser-closed'; },
		  };
		  const createdContext = browserUpgraded.newContext.call(browserBase);
		  const createdPage = createdContext.newPage();
		  const pagesFallback = browserUpgraded.pages.call(browserBase);
		  const directPage = browserUpgraded.getPage.call(browserBase);
		  const contextPage = createdContext.getPage();
		  const browserClose = browserUpgraded.close.call(browserBase);
		  const contextClose = createdContext.close();
		  return {
		    createdContextHasNewPage: typeof createdContext.newPage === 'function',
		    createdPageId: createdPage.id,
		    createdPageEvaluate: createdPage.evaluate((suffix) => createdPage.id + suffix, '-ok'),
		    pagesFallbackLength: pagesFallback.length,
		    pagesFallbackFirstIsFacade: typeof pagesFallback[0].locator === 'function',
		    directPageId: directPage.id,
		    contextPageId: contextPage.id,
		    browserClose,
		    contextClose,
		    browserClosed: browserBase.closed,
		    contextClosed: contextBase.closed,
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("browser/context UpperCamel fallback probe failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	if result["createdContextHasNewPage"] != true || result["createdPageId"] != "page-b" || result["createdPageEvaluate"] != "page-b-ok" {
		t.Fatalf("unexpected created context/page payload: %#v", result)
	}
	if result["pagesFallbackLength"] != int64(1) && result["pagesFallbackLength"] != 1 {
		t.Fatalf("unexpected pages fallback length: %#v", result)
	}
	if result["pagesFallbackFirstIsFacade"] != true || result["directPageId"] != "page-a" || result["contextPageId"] != "page-a" {
		t.Fatalf("unexpected page getter fallback payload: %#v", result)
	}
	if result["browserClose"] != "browser-closed" || result["contextClose"] != "context-closed" {
		t.Fatalf("unexpected close payload: %#v", result)
	}
	if result["browserClosed"] != int64(1) && result["browserClosed"] != 1 {
		t.Fatalf("unexpected browser close count: %#v", result)
	}
	if result["contextClosed"] != int64(1) && result["contextClosed"] != 1 {
		t.Fatalf("unexpected context close count: %#v", result)
	}
}

func TestPlaywrightStackAliasesStayConsistentWithLaunchHandle(t *testing.T) {
	rt := newRuntimeForFacadeTests(t)
	if err := ApplyRuntimeStackMode(rt, "playwright"); err != nil {
		t.Fatalf("ApplyRuntimeStackMode returned error: %v", err)
	}
	value, err := rt.RunString(`
		(() => {
		  const browserHandle = playwright.chromium.launch();
		  const contextHandle = browserHandle.getContext();
		  const pageHandle = browserHandle.getPage();
		  return {
		    runtimeBrowserAliased: browser === browserUpgraded,
		    runtimeContextAliased: context === contextUpgraded,
		    runtimePageAliased: page === pageUpgraded,
		    handleContextHasNewPage: !!contextHandle && typeof contextHandle.newPage === 'function',
		    handlePageHasLocator: !!pageHandle && typeof pageHandle.locator === 'function',
		    newContextHasGetPage: typeof browserHandle.newContext().getPage === 'function',
		  };
		})()
	`)
	if err != nil {
		t.Fatalf("playwright alias consistency failed: %v", err)
	}
	result := exportedMapFromObject(t, value)
	for _, key := range []string{"runtimeBrowserAliased", "runtimeContextAliased", "runtimePageAliased", "handleContextHasNewPage", "handlePageHasLocator", "newContextHasGetPage"} {
		if result[key] != true {
			t.Fatalf("expected %s to be true, got %#v", key, result)
		}
	}
}
