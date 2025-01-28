package automation

type Browser struct {
	pages []*Page
}

func NewBrowser() *Browser {
	return &Browser{
		pages: make([]*Page, 0),
	}
}

func (b *Browser) NewPage() (*Page, error) {
	page := NewPage()
	b.pages = append(b.pages, page)
	return page, nil
}
