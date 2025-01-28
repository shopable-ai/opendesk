package automation

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

func RunScript(page *Page, script string) error {
	lines := strings.Split(script, "\n")
	for lineNum, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		if err := executeLine(page, line); err != nil {
			return fmt.Errorf("line %d '%s': %v", lineNum+1, line, err)
		}
	}
	return nil
}

func executeLine(page *Page, line string) error {

	// mouse.click(x, y[, options])
	if matches := regexp.MustCompile(`mouse\.click\((\d+),\s*(\d+)(?:,\s*({[^}]*}))?\)`).FindStringSubmatch(line); matches != nil {
		x, _ := strconv.Atoi(matches[1])
		y, _ := strconv.Atoi(matches[2])

		options := MouseOptions{
			Button:     "left",
			ClickCount: 1,
			Delay:      0,
		}

		if len(matches) > 3 && matches[3] != "" {
			// 解析选项对象
			optStr := matches[3]
			if button := regexp.MustCompile(`button:\s*"([^"]*)"`).FindStringSubmatch(optStr); button != nil {
				options.Button = button[1]
			}
			if clickCount := regexp.MustCompile(`clickCount:\s*(\d+)`).FindStringSubmatch(optStr); clickCount != nil {
				options.ClickCount, _ = strconv.Atoi(clickCount[1])
			}
			if delay := regexp.MustCompile(`delay:\s*(\d+)`).FindStringSubmatch(optStr); delay != nil {
				options.Delay, _ = strconv.Atoi(delay[1])
			}
		}

		return page.Mouse().click(x, y, options)
	}

	// mouse.move(x, y[, options])
	if matches := regexp.MustCompile(`mouse\.move\((\d+),\s*(\d+)(?:,\s*({[^}]*}))?\)`).FindStringSubmatch(line); matches != nil {
		x, _ := strconv.Atoi(matches[1])
		y, _ := strconv.Atoi(matches[2])

		options := MouseOptions{Steps: 1}

		if len(matches) > 3 && matches[3] != "" {
			if steps := regexp.MustCompile(`steps:\s*(\d+)`).FindStringSubmatch(matches[3]); steps != nil {
				options.Steps, _ = strconv.Atoi(steps[1])
			}
		}

		return page.Mouse().move(x, y, options)
	}

	// mouse.down([options])
	if matches := regexp.MustCompile(`mouse\.down\(({[^}]*})?\)`).FindStringSubmatch(line); matches != nil {
		options := MouseOptions{
			Button:     "left",
			ClickCount: 1,
		}

		if len(matches) > 1 && matches[1] != "" {
			optStr := matches[1]
			if button := regexp.MustCompile(`button:\s*"([^"]*)"`).FindStringSubmatch(optStr); button != nil {
				options.Button = button[1]
			}
			if clickCount := regexp.MustCompile(`clickCount:\s*(\d+)`).FindStringSubmatch(optStr); clickCount != nil {
				options.ClickCount, _ = strconv.Atoi(clickCount[1])
			}
		}

		return page.Mouse().down(options)
	}

	// mouse.up([options])
	if matches := regexp.MustCompile(`mouse\.up\(({[^}]*})?\)`).FindStringSubmatch(line); matches != nil {
		options := MouseOptions{
			Button:     "left",
			ClickCount: 1,
		}

		if len(matches) > 1 && matches[1] != "" {
			optStr := matches[1]
			if button := regexp.MustCompile(`button:\s*"([^"]*)"`).FindStringSubmatch(optStr); button != nil {
				options.Button = button[1]
			}
			if clickCount := regexp.MustCompile(`clickCount:\s*(\d+)`).FindStringSubmatch(optStr); clickCount != nil {
				options.ClickCount, _ = strconv.Atoi(clickCount[1])
			}
		}

		return page.Mouse().up(options)
	}

	// touchscreen.tap(x, y)
	if matches := regexp.MustCompile(`touchscreen\.tap\((\d+),\s*(\d+)\)`).FindStringSubmatch(line); matches != nil {
		x, _ := strconv.Atoi(matches[1])
		y, _ := strconv.Atoi(matches[2])
		return page.Touchscreen().tap(x, y)
	}

	// keyboard.type("text")
	if matches := regexp.MustCompile(`keyboard\.type\("([^"]*)"\)`).FindStringSubmatch(line); matches != nil {
		return page.Keyboard().Type(matches[1])
	}

	// keyboard.Press("key")
	if matches := regexp.MustCompile(`keyboard\.press\("([^"]*)"\)`).FindStringSubmatch(line); matches != nil {
		return page.Keyboard().Press(matches[1])
	}

	// screenshot with options object
	if matches := regexp.MustCompile(`screenshot\(({[^}]*})\)`).FindStringSubmatch(line); matches != nil {
		optionsStr := matches[1]
		options := &ScreenshotOptions{
			Type:     "png",
			Encoding: "binary",
		}

		// Parse path
		if path := regexp.MustCompile(`path:\s*"([^"]*)"`).FindStringSubmatch(optionsStr); path != nil {
			options.Path = path[1]
		}

		// Parse type
		if typ := regexp.MustCompile(`type:\s*"([^"]*)"`).FindStringSubmatch(optionsStr); typ != nil {
			options.Type = typ[1]
		}

		// Parse quality
		if quality := regexp.MustCompile(`quality:\s*(\d+)`).FindStringSubmatch(optionsStr); quality != nil {
			options.Quality, _ = strconv.Atoi(quality[1])
		}

		// Parse fullPage
		if fullPage := regexp.MustCompile(`fullPage:\s*(true|false)`).FindStringSubmatch(optionsStr); fullPage != nil {
			options.FullPage = fullPage[1] == "true"
		}

		// Parse clip
		if clip := regexp.MustCompile(`clip:\s*{([^}]*)}`).FindStringSubmatch(optionsStr); clip != nil {
			clipStr := clip[1]
			clipOptions := &ClipOptions{}

			if x := regexp.MustCompile(`x:\s*(\d+)`).FindStringSubmatch(clipStr); x != nil {
				clipOptions.X, _ = strconv.Atoi(x[1])
			}
			if y := regexp.MustCompile(`y:\s*(\d+)`).FindStringSubmatch(clipStr); y != nil {
				clipOptions.Y, _ = strconv.Atoi(y[1])
			}
			if width := regexp.MustCompile(`width:\s*(\d+)`).FindStringSubmatch(clipStr); width != nil {
				clipOptions.Width, _ = strconv.Atoi(width[1])
			}
			if height := regexp.MustCompile(`height:\s*(\d+)`).FindStringSubmatch(clipStr); height != nil {
				clipOptions.Height, _ = strconv.Atoi(height[1])
			}

			options.Clip = clipOptions
		}

		// Parse omitBackground
		if omitBg := regexp.MustCompile(`omitBackground:\s*(true|false)`).FindStringSubmatch(optionsStr); omitBg != nil {
			options.OmitBackground = omitBg[1] == "true"
		}

		// Parse encoding
		if encoding := regexp.MustCompile(`encoding:\s*"([^"]*)"`).FindStringSubmatch(optionsStr); encoding != nil {
			options.Encoding = encoding[1]
		}

		_, err := page.screenshot(options) // 忽略第一个返回值，只使用 error
		return err
	}

	// Support for legacy format: screenshot("filename")
	if matches := regexp.MustCompile(`screenshot\("([^"]*)"\)`).FindStringSubmatch(line); matches != nil {
		_, err := page.screenshot(&ScreenshotOptions{
			Path:     matches[1],
			Type:     "png",
			Encoding: "binary",
		})

		return err
	}

	// WaitFor(milliseconds)
	if matches := regexp.MustCompile(`waitFor\((\d+)\)`).FindStringSubmatch(line); matches != nil {
		timeout, _ := strconv.ParseInt(matches[1], 10, 64) // 使用 ParseInt 转换为 int64
		return page.WaitFor(timeout)
	}

	// title()
	if matches := regexp.MustCompile(`title\(\)`).FindStringSubmatch(line); matches != nil {
		title := page.title()
		fmt.Printf("Window Title: %s\n", title)
		return nil
	}

	// url()
	if matches := regexp.MustCompile(`url\(\)`).FindStringSubmatch(line); matches != nil {
		url := page.url()
		fmt.Printf("Executable Path: %s\n", url)
		return nil
	}

	return fmt.Errorf("unrecognized command: %s", line)
}
