package automation

import (
	"fmt"
	"math/rand"
	"runtime"
	"time"
)

type UserAgent struct {
	browserVersions map[string][]string
	osVersions      map[string][]string
}

func New() *UserAgent {
	ua := &UserAgent{
		browserVersions: map[string][]string{
			"chrome":  {"120.0.0.0", "119.0.0.0", "118.0.0.0"},
			"firefox": {"121.0", "120.0", "119.0"},
			"safari":  {"17.2", "17.1", "17.0"},
			"edge":    {"120.0.0.0", "119.0.0.0", "118.0.0.0"},
		},
		osVersions: map[string][]string{
			"windows": {
				"Windows NT 10.0; Win64; x64",
				"Windows NT 11.0; Win64; x64",
			},
			"mac": {
				"Macintosh; Intel Mac OS X 10_15_7",
				"Macintosh; Intel Mac OS X 11_6_0",
				"Macintosh; Intel Mac OS X 12_0_0",
			},
			"linux": {
				"X11; Linux x86_64",
				"X11; Ubuntu; Linux x86_64",
			},
		},
	}
	rand.Seed(time.Now().UnixNano())
	return ua
}

func (ua *UserAgent) random(arr []string) string {
	return arr[rand.Intn(len(arr))]
}

func (ua *UserAgent) getPlatform() string {
	switch runtime.GOOS {
	case "windows":
		return ua.random(ua.osVersions["windows"])
	case "darwin":
		return ua.random(ua.osVersions["mac"])
	default:
		return ua.random(ua.osVersions["linux"])
	}
}

func (ua *UserAgent) Chrome() string {
	platform := ua.getPlatform()
	version := ua.random(ua.browserVersions["chrome"])
	return fmt.Sprintf("Mozilla/5.0 (%s) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Safari/537.36",
		platform, version)
}

func (ua *UserAgent) Firefox() string {
	platform := ua.getPlatform()
	version := ua.random(ua.browserVersions["firefox"])
	return fmt.Sprintf("Mozilla/5.0 (%s; rv:%s) Gecko/20100101 Firefox/%s",
		platform, version, version)
}

func (ua *UserAgent) Edge() string {
	platform := ua.getPlatform()
	version := ua.random(ua.browserVersions["edge"])
	return fmt.Sprintf("Mozilla/5.0 (%s) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Safari/537.36 Edg/%s",
		platform, version, version)
}

func (ua *UserAgent) Safari() string {
	platform := ua.random(ua.osVersions["mac"])
	version := ua.random(ua.browserVersions["safari"])
	return fmt.Sprintf("Mozilla/5.0 (%s) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/%s Safari/605.1.15",
		platform, version)
}

func (ua *UserAgent) Random() string {
	switch rand.Intn(4) {
	case 0:
		return ua.Chrome()
	case 1:
		return ua.Firefox()
	case 2:
		return ua.Edge()
	default:
		return ua.Safari()
	}
}

// DefaultHeaders 返回常见的浏览器请求头
func (ua *UserAgent) DefaultHeaders() map[string]string {
	return map[string]string{
		"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
		"Accept-Language":           "en-US,en;q=0.5",
		"Connection":                "keep-alive",
		"Upgrade-Insecure-Requests": "1",
		"Sec-Fetch-Dest":            "document",
		"Sec-Fetch-Mode":            "navigate",
		"Sec-Fetch-Site":            "none",
		"Sec-Fetch-User":            "?1",
	}
}
