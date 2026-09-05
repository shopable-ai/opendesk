package automation

import (
	"encoding/json"
	"fmt"
	"opendesk/pkg/terminalstyle"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// EventSink 接收运行期结构化事件。
type EventSink interface {
	Emit(category, level, source, kind, message string, fields map[string]any)
}

type consoleControlSink interface {
	ClearConsole()
}

// Console 提供脚本 console.* 能力。
type Console struct {
	sink EventSink
}

func NewConsole() *Console {
	return &Console{}
}

// NewConsoleWithSink 创建带事件接收器的 console。
func NewConsoleWithSink(sink EventSink) *Console {
	return &Console{sink: sink}
}

// formatArgs 格式化参数，处理 null 值。
func formatArgs(args ...interface{}) []interface{} {
	formattedArgs := make([]interface{}, len(args))
	for i, arg := range args {
		if arg == nil {
			formattedArgs[i] = "null"
			continue
		}

		switch v := arg.(type) {
		case string, int, int64, float64, bool:
			formattedArgs[i] = v
		default:
			jsonData, err := json.MarshalIndent(v, "", "  ")
			if err != nil {
				formattedArgs[i] = fmt.Sprintf("%+v", v)
			} else {
				formattedArgs[i] = string(jsonData)
			}
		}
	}
	return formattedArgs
}

func (c *Console) emit(category, level, method, prefix string, args ...interface{}) {
	formatted := formatArgs(args...)
	message := strings.TrimSpace(fmt.Sprintln(formatted...))
	location := getFileAndLine()
	fields := map[string]any{
		"location":      location,
		"consoleMethod": method,
	}

	if c != nil && c.sink != nil {
		c.sink.Emit(category, level, "console", "log", message, fields)
		return
	}

	timeStr := time.Now().Format("15:04:05.000")
	renderedArgs := strings.TrimSuffix(fmt.Sprintln(formatted...), "\n")
	line := fmt.Sprintf("%s %s %s: %s", prefix, timeStr, location, renderedArgs)
	line = terminalstyle.ColorizeTaggedLine(line, terminalstyle.ModeAuto, os.Stdout)
	_, _ = terminalstyle.WriteString(os.Stdout, line+"\n")
}

// Log 普通日志打印。
func (c *Console) Log(args ...interface{}) {
	c.emit("script", "info", "log", "[LOG]", args...)
}

// Info 信息日志。
func (c *Console) Info(args ...interface{}) {
	c.emit("script", "info", "info", "[INFO]", args...)
}

// Warn 警告日志。
func (c *Console) Warn(args ...interface{}) {
	c.emit("script", "warn", "warn", "[WARN]", args...)
}

// Error 错误日志。
func (c *Console) Error(args ...interface{}) {
	c.emit("error", "error", "error", "[ERROR]", args...)
}

// Debug 调试日志。
func (c *Console) Debug(args ...interface{}) {
	c.emit("script", "debug", "debug", "[DEBUG]", args...)
}

// Table 打印表格形式的数据。
func (c *Console) Table(data interface{}) {
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		c.Error("Failed to format table data:", err)
		return
	}
	c.emit("script", "info", "table", "[TABLE]", string(jsonData))
}

// Group 分组打印开始。
func (c *Console) Group(label string) {
	c.emit("script", "info", "group", "[GROUP]", label+" ▼")
}

// GroupEnd 分组打印结束。
func (c *Console) GroupEnd(label string) {
	c.emit("script", "info", "groupEnd", "[GROUP]", label+" ▲")
}

// Time 计时开始。
func (c *Console) Time(label string) {
	c.emit("script", "debug", "time", "[TIME]", fmt.Sprintf("开始计时 '%s'", label))
}

// TimeEnd 计时结束。
func (c *Console) TimeEnd(label string) {
	c.emit("script", "debug", "timeEnd", "[TIME]", fmt.Sprintf("结束计时 '%s'", label))
}

// Clear 清除控制台。
func (c *Console) Clear() {
	if c != nil && c.sink != nil {
		if sink, ok := c.sink.(consoleControlSink); ok {
			sink.ClearConsole()
		}
		return
	}
	terminalstyle.ClearScreen(os.Stdout)
}

// getFileAndLine 获取调用位置的文件名和行号。
func getFileAndLine() string {
	_, file, line, ok := runtime.Caller(2)
	if !ok {
		return "unknown:0"
	}
	fileName := filepath.Base(file)
	return fmt.Sprintf("%s:%d", fileName, line)
}
