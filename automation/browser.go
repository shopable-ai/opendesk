package automation

import "fmt"

// Browser is the preserved legacy browser entrypoint plus an upgraded
// multi-context container for newer compatibility layers.
type Browser struct {
	pages          []*Page
	contexts       []*BrowserContext
	defaultContext *BrowserContext
	closed         bool
}

func NewBrowser() *Browser {
	b := &Browser{
		pages:    make([]*Page, 0),
		contexts: make([]*BrowserContext, 0),
	}
	b.defaultContext = b.NewContext()
	return b
}

// NewPage preserves the original legacy behavior: create a page from the
// browser default context.
func (b *Browser) NewPage() (*Page, error) {
	if b == nil {
		return nil, fmt.Errorf("browser is nil")
	}
	if b.closed {
		return nil, fmt.Errorf("browser is closed")
	}
	return b.defaultContext.NewPage()
}

// NewContext creates an isolated context for upgraded/playwright-style code.
func (b *Browser) NewContext() *BrowserContext {
	ctx := &BrowserContext{
		browser: b,
		pages:   make([]*Page, 0),
		cookies: make([]map[string]interface{}, 0),
		storage: map[string]interface{}{},
		session: map[string]interface{}{},
	}
	b.contexts = append(b.contexts, ctx)
	if b.defaultContext == nil {
		b.defaultContext = ctx
	}
	return ctx
}

func (b *Browser) DefaultContext() *BrowserContext {
	if b == nil {
		return nil
	}
	if b.defaultContext == nil {
		b.defaultContext = b.NewContext()
	}
	return b.defaultContext
}

func (b *Browser) Contexts() []*BrowserContext {
	if b == nil {
		return nil
	}
	out := make([]*BrowserContext, len(b.contexts))
	copy(out, b.contexts)
	return out
}

func (b *Browser) Pages() []*Page {
	if b == nil {
		return nil
	}
	out := make([]*Page, len(b.pages))
	copy(out, b.pages)
	return out
}

func (b *Browser) LastPage() *Page {
	if b == nil || len(b.pages) == 0 {
		return nil
	}
	return b.pages[len(b.pages)-1]
}

func (b *Browser) Close() error {
	if b == nil {
		return nil
	}
	b.closed = true
	return nil
}

func (b *Browser) IsClosed() bool {
	if b == nil {
		return true
	}
	return b.closed
}

func (b *Browser) registerPage(page *Page) {
	if b == nil || page == nil {
		return
	}
	b.pages = append(b.pages, page)
}

// BrowserContext is the upgraded compatibility layer that resembles modern
// browser automation runtimes without removing legacy page access.
type BrowserContext struct {
	browser *Browser
	pages   []*Page
	cookies []map[string]interface{}
	storage map[string]interface{}
	session map[string]interface{}
	closed  bool
}

func (c *BrowserContext) Browser() *Browser {
	if c == nil {
		return nil
	}
	return c.browser
}

func (c *BrowserContext) NewPage() (*Page, error) {
	if c == nil {
		return nil, fmt.Errorf("context is nil")
	}
	if c.closed {
		return nil, fmt.Errorf("context is closed")
	}
	if c.browser != nil && c.browser.IsClosed() {
		return nil, fmt.Errorf("browser is closed")
	}
	page := NewPage()
	c.AdoptPage(page)
	return page, nil
}

func (c *BrowserContext) AdoptPage(page *Page) {
	if c == nil || page == nil {
		return
	}
	page.ownerContext = c
	if c.browser != nil {
		page.ownerBrowser = c.browser
	}
	c.pages = append(c.pages, page)
	if c.browser != nil {
		c.browser.registerPage(page)
	}
}

func (c *BrowserContext) Pages() []*Page {
	if c == nil {
		return nil
	}
	out := make([]*Page, len(c.pages))
	copy(out, c.pages)
	return out
}

func (c *BrowserContext) LastPage() *Page {
	if c == nil || len(c.pages) == 0 {
		return nil
	}
	return c.pages[len(c.pages)-1]
}

func (c *BrowserContext) Close() error {
	if c == nil {
		return nil
	}
	c.closed = true
	return nil
}

func (c *BrowserContext) IsClosed() bool {
	if c == nil {
		return true
	}
	return c.closed
}

func (c *BrowserContext) Cookies() []map[string]interface{} {
	if c == nil {
		return nil
	}
	out := make([]map[string]interface{}, len(c.cookies))
	copy(out, c.cookies)
	return out
}

func (c *BrowserContext) SetCookies(cookies []map[string]interface{}) error {
	if c == nil {
		return fmt.Errorf("context is nil")
	}
	c.cookies = append([]map[string]interface{}{}, cookies...)
	return nil
}

func (c *BrowserContext) ClearCookies() error {
	if c == nil {
		return fmt.Errorf("context is nil")
	}
	c.cookies = nil
	return nil
}

func (c *BrowserContext) Storage() map[string]interface{} {
	if c == nil {
		return nil
	}
	out := make(map[string]interface{}, len(c.storage))
	for k, v := range c.storage {
		out[k] = v
	}
	return out
}

func (c *BrowserContext) SetStorage(key string, value interface{}) error {
	if c == nil {
		return fmt.Errorf("context is nil")
	}
	if c.storage == nil {
		c.storage = map[string]interface{}{}
	}
	c.storage[key] = value
	return nil
}

func (c *BrowserContext) GetStorage(key string) interface{} {
	if c == nil || c.storage == nil {
		return nil
	}
	return c.storage[key]
}

func (c *BrowserContext) ClearStorage() error {
	if c == nil {
		return fmt.Errorf("context is nil")
	}
	c.storage = map[string]interface{}{}
	return nil
}

func (c *BrowserContext) Session() map[string]interface{} {
	if c == nil {
		return nil
	}
	out := make(map[string]interface{}, len(c.session))
	for k, v := range c.session {
		out[k] = v
	}
	return out
}

func (c *BrowserContext) SetSessionValue(key string, value interface{}) error {
	if c == nil {
		return fmt.Errorf("context is nil")
	}
	if c.session == nil {
		c.session = map[string]interface{}{}
	}
	c.session[key] = value
	return nil
}

func (c *BrowserContext) GetSessionValue(key string) interface{} {
	if c == nil || c.session == nil {
		return nil
	}
	return c.session[key]
}

func (c *BrowserContext) ClearSession() error {
	if c == nil {
		return fmt.Errorf("context is nil")
	}
	c.session = map[string]interface{}{}
	return nil
}
