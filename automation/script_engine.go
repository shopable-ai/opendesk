package automation

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var page *Page

func init() {
	page = NewPage()
}

func RunScript(script string) error {
	lines := strings.Split(script, "\n")
	for lineNum, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		if err := executeLine(line); err != nil {
			return fmt.Errorf("执行失败(第%d行) '%s': %v", lineNum+1, line, err)
		}
	}
	return nil
}

func executeLine(line string) error {
	// 解析 page.click(x, y)
	if clickRegex := regexp.MustCompile(`page\.click\((\d+),\s*(\d+)\)`); clickRegex.MatchString(line) {
		matches := clickRegex.FindStringSubmatch(line)
		x, _ := strconv.Atoi(matches[1])
		y, _ := strconv.Atoi(matches[2])
		<-page.Click(x, y)
		return nil
	}

	// 解析 page.type("text")
	if typeRegex := regexp.MustCompile(`page\.type\("([^"]*)"\)`); typeRegex.MatchString(line) {
		matches := typeRegex.FindStringSubmatch(line)
		<-page.Type(matches[1])
		return nil
	}

	// 解析 page.press("key")
	if pressRegex := regexp.MustCompile(`page\.press\("([^"]*)"\)`); pressRegex.MatchString(line) {
		matches := pressRegex.FindStringSubmatch(line)
		<-page.Press(matches[1])
		return nil
	}

	// 解析 page.screenshot("filename") - 全屏截图
	if screenshotRegex := regexp.MustCompile(`page\.screenshot\("([^"]*)"\)`); screenshotRegex.MatchString(line) {
		matches := screenshotRegex.FindStringSubmatch(line)
		<-page.Screenshot(matches[1], 0, 0, 0, 0)
		return nil
	}

	// 解析 page.screenshot("filename", x, y, width, height) - 区域截图
	if screenshotRegex := regexp.MustCompile(`page\.screenshot\("([^"]*)",\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)`); screenshotRegex.MatchString(line) {
		matches := screenshotRegex.FindStringSubmatch(line)
		filename := matches[1]
		x, _ := strconv.Atoi(matches[2])
		y, _ := strconv.Atoi(matches[3])
		width, _ := strconv.Atoi(matches[4])
		height, _ := strconv.Atoi(matches[5])
		<-page.Screenshot(filename, x, y, width, height)
		return nil
	}

	return fmt.Errorf("无法识别的命令: %s", line)
}
