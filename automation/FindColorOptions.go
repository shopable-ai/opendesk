package automation

import (
	"encoding/json"
	"image"
)

// FindColorOptions 定义颜色搜索的参数选项
type FindColorOptions struct {
	X         *int `json:"x,omitempty"`         // Optional, defaults to 0
	Y         *int `json:"y,omitempty"`         // Optional, defaults to 0
	Width     *int `json:"width,omitempty"`     // Optional, defaults to full image width
	Height    *int `json:"height,omitempty"`    // Optional, defaults to full image height
	Threshold *int `json:"threshold,omitempty"` // Optional, defaults to 5
}

// NewFindColorOptions 创建新的颜色搜索选项实例
func NewFindColorOptions() *FindColorOptions {
	return &FindColorOptions{}
}

// WithX 设置 X 坐标
func (o *FindColorOptions) WithX(x int) *FindColorOptions {
	o.X = &x
	return o
}

// WithY 设置 Y 坐标
func (o *FindColorOptions) WithY(y int) *FindColorOptions {
	o.Y = &y
	return o
}

// WithWidth 设置宽度
func (o *FindColorOptions) WithWidth(width int) *FindColorOptions {
	o.Width = &width
	return o
}

// WithHeight 设置高度
func (o *FindColorOptions) WithHeight(height int) *FindColorOptions {
	o.Height = &height
	return o
}

// WithThreshold 设置阈值
func (o *FindColorOptions) WithThreshold(threshold int) *FindColorOptions {
	o.Threshold = &threshold
	return o
}

// GetSearchBounds 根据选项和图片尺寸返回搜索范围
func (o *FindColorOptions) GetSearchBounds(img image.Image) (x, y, width, height, threshold int) {
	bounds := img.Bounds()

	// 设置默认值
	if o == nil {
		return 0, 0, bounds.Max.X, bounds.Max.Y, 5
	}

	// 处理 X 坐标
	if o.X == nil {
		x = 0
	} else {
		x = *o.X
	}

	// 处理 Y 坐标
	if o.Y == nil {
		y = 0
	} else {
		y = *o.Y
	}

	// 处理宽度
	if o.Width == nil {
		width = bounds.Max.X - x
	} else {
		width = *o.Width
	}

	// 处理高度
	if o.Height == nil {
		height = bounds.Max.Y - y
	} else {
		height = *o.Height
	}

	// 处理阈值
	if o.Threshold == nil {
		threshold = 5
	} else {
		threshold = *o.Threshold
	}

	// 确保边界在图片范围内
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	if x+width > bounds.Max.X {
		width = bounds.Max.X - x
	}
	if y+height > bounds.Max.Y {
		height = bounds.Max.Y - y
	}

	return
}

// ParseOptions 将选项字符串解析为 FindColorOptions
func ParseOptions(optionsStr string) (*FindColorOptions, error) {
	if optionsStr == "" {
		return nil, nil
	}

	var options FindColorOptions
	if err := json.Unmarshal([]byte(optionsStr), &options); err != nil {
		return nil, err
	}
	return &options, nil
}

// ToJSON 将选项转换为 JSON 字符串
func (o *FindColorOptions) ToJSON() (string, error) {
	if o == nil {
		return "", nil
	}

	data, err := json.Marshal(o)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
