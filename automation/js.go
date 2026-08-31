package automation

import "strconv"

// jsToInt 将JavaScript值转换为Go int类型
func jsToInt(value interface{}) int {
	if value == nil {
		return 0
	}

	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64: // JavaScript数字默认是float64
		return int(v)
	case string: // 处理可能的字符串数字
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return 0
}
