# 第1轮讨论：项目现状初步分析

## 讨论元数据
- 轮次: 1/100+
- 阶段: 发现阶段
- 参与专家: 架构师、代码质量专家、性能专家、安全专家、测试专家
- 时间: 2026-03-17

## 项目基本信息

### 代码规模
- 总代码行数: 16,167行
- 主要语言: Go + JavaScript
- 核心模块: automation包 (47个文件)
- 测试覆盖率:
  - 主包: 11.0%
  - automation包: 26.0%

### 项目定位
TestMonkey-go 是一个跨平台的UI自动化测试框架，提供:
1. JavaScript运行时环境 (基于goja)
2. 鼠标/键盘/触摸屏控制
3. 屏幕截图和OCR识别
4. 窗口管理
5. HTTP服务器模式
6. 视觉识别 (Vision API)

## 专家1: 架构师 - 架构分析

### 当前架构评估

#### 优点
1. **清晰的模块划分**: automation包封装了所有自动化能力
2. **跨平台设计**: 使用build tags分离平台特定代码 (darwin/stub)
3. **多入口支持**: CLI模式 + HTTP服务器模式
4. **JavaScript集成**: 通过goja提供脚本能力

#### 问题识别

##### P0 - 严重问题
1. **全局状态管理混乱**
   - main.go中使用全局变量 `jsRuntime`, `page`, `vision`
   - 并发安全性存疑
   - 难以测试和维护

2. **职责不清**
   - main.go承担了太多职责: 初始化、HTTP服务、脚本执行、配置解析
   - 1118行代码，违反单一职责原则

3. **缺少依赖注入**
   - 硬编码依赖关系
   - 难以mock和测试

##### P1 - 重要问题
1. **script_engine.go设计过时**
   - 使用正则表达式解析命令
   - 仅支持简单的文本脚本格式
   - 与JavaScript运行时功能重复

2. **错误处理不一致**
   - 有些地方panic，有些返回error
   - 缺少统一的错误类型

3. **配置管理简陋**
   - 使用flag包直接解析
   - 缺少配置验证
   - 不支持配置文件

##### P2 - 次要问题
1. **文档与代码不同步风险**
   - runtime-api.md和runtime-api.ai.json需要手动维护
   - 容易出现不一致

2. **日志系统缺失**
   - 使用fmt.Printf，不支持日志级别
   - 难以调试生产问题

### 架构优化建议

#### 建议1: 引入分层架构
```
presentation/     # HTTP handlers, CLI commands
  ├── http/
  └── cli/
application/      # 业务逻辑
  ├── script/     # 脚本执行服务
  ├── vision/     # 视觉识别服务
  └── automation/ # 自动化服务
domain/           # 核心领域模型
  ├── page/
  ├── mouse/
  └── keyboard/
infrastructure/   # 基础设施
  ├── runtime/    # JS运行时
  ├── platform/   # 平台特定实现
  └── storage/
```

#### 建议2: 依赖注入容器
```go
type Container struct {
    Runtime  *goja.Runtime
    Page     *automation.Page
    Vision   *automation.Vision
    Config   *Config
    Logger   Logger
}

func NewContainer(config *Config) (*Container, error) {
    // 初始化所有依赖
}
```

#### 建议3: 接口隔离
```go
type ScriptExecutor interface {
    Execute(ctx context.Context, script string) error
}

type ScreenshotProvider interface {
    Capture(ctx context.Context, opts ScreenshotOptions) ([]byte, error)
}

type VisionProvider interface {
    RunOCR(ctx context.Context, opts OCROptions) (*OCRResult, error)
    DetectUI(ctx context.Context, opts DetectOptions) (*DetectResult, error)
}
```

### 架构评分
- 模块化程度: 4/7 (有基本模块划分，但职责不够清晰)
- 扩展性: 3/6 (硬编码依赖，难以扩展)
- 解耦程度: 3/6 (全局状态，紧耦合)
- 设计模式应用: 2/6 (缺少常见设计模式)

**小计: 12/25**

## 专家2: 代码质量专家 - 代码质量分析

### 代码规范性问题

#### 命名不一致
1. `script_engine.go` vs `scriptEngine.go` (文件命名风格不统一)
2. `RunScript` vs `executeScript` (公开/私有函数命名)
3. `OCR` vs `Ocr` (缩写大小写不一致)

#### 代码重复
1. HTTP handler中重复的错误处理模式
2. 多处重复的类型转换代码 (toString, toBool, toInt)
3. 权限检查逻辑重复

### 可读性问题

#### main.go复杂度过高
```go
// 函数过长示例
func executeJavaScript(script string, timeoutMinutes int) error {
    // 247-343行，97行代码
    // 包含多层嵌套
    // 职责混杂: 脚本包装、超时控制、错误处理
}
```

#### 注释不足
- 大部分函数缺少文档注释
- 复杂逻辑缺少解释
- 魔法数字未说明

### 错误处理问题

#### 不一致的错误处理
```go
// 有些地方panic
panic(jsRuntime.NewGoError(err))

// 有些地方返回error
return fmt.Errorf("failed: %v", err)

// 有些地方忽略错误
_, _ = jsRuntime.RunString(script)
```

#### 缺少错误上下文
```go
// 不好的例子
return err

// 应该
return fmt.Errorf("execute script %s: %w", scriptPath, err)
```

### 代码质量评分
- 代码规范性: 3/5 (基本遵循Go规范，但不一致)
- 可读性: 3/5 (函数过长，注释不足)
- 复杂度控制: 2/5 (main.go过于复杂)
- 错误处理: 2/5 (不一致，缺少上下文)

**小计: 10/20**

## 专家3: 性能专家 - 性能分析

### 性能瓶颈识别

#### 1. 全局锁竞争
```go
// main.go中的全局变量在并发场景下可能有问题
var (
    jsRuntime *goja.Runtime  // 非线程安全
    page      *automation.Page
    vision    *automation.Vision
)
```

#### 2. 重复初始化
```go
// initRuntime()可能被多次调用
func initRuntime() {
    if jsRuntime == nil {
        // 初始化逻辑
    }
}
```

#### 3. 同步阻塞
```go
// executeJavaScript中使用channel等待，但没有buffer
done := make(chan error)  // 应该使用 make(chan error, 1)
```

#### 4. 内存分配
- 大量字符串拼接未使用strings.Builder
- 临时文件未及时清理
- 截图数据可能占用大量内存

### 性能优化建议

#### 建议1: 对象池
```go
var screenshotBufferPool = sync.Pool{
    New: func() interface{} {
        return new(bytes.Buffer)
    },
}
```

#### 建议2: 并发控制
```go
type RuntimePool struct {
    runtimes chan *goja.Runtime
    maxSize  int
}

func (p *RuntimePool) Get() *goja.Runtime {
    select {
    case rt := <-p.runtimes:
        return rt
    default:
        return goja.New()
    }
}
```

#### 建议3: 异步处理
```go
// HTTP handler应该立即返回，后台执行
go func() {
    defer func() {
        if r := recover(); r != nil {
            log.Error("script panic", r)
        }
    }()
    executeScript(script)
}()
```

### 性能评分
- 响应时间: 3/5 (同步执行，可能阻塞)
- 资源利用率: 3/5 (内存管理可优化)
- 并发处理能力: 2/5 (全局状态，并发不安全)

**小计: 8/15**

## 专家4: 安全专家 - 安全分析

### 安全风险识别

#### 高风险
1. **任意代码执行**
   - HTTP接口允许执行任意JavaScript代码
   - 缺少沙箱隔离
   - 缺少权限控制

2. **路径遍历**
   ```go
   // File.read(path) 未验证路径
   content, err := os.ReadFile(path)
   ```

3. **命令注入**
   ```go
   // System.killProcess(pid) 直接执行系统命令
   ```

#### 中风险
1. **CORS配置过于宽松**
   ```go
   w.Header().Set("Access-Control-Allow-Origin", "*")
   ```

2. **缺少认证机制**
   - HTTP接口无需认证
   - 任何人都可以调用

3. **敏感信息泄露**
   - 错误信息可能包含系统路径
   - 日志可能包含敏感数据

### 安全加固建议

#### 建议1: 沙箱隔离
```go
type SandboxConfig struct {
    AllowedPaths    []string
    AllowedCommands []string
    MaxMemory       int64
    MaxCPU          time.Duration
}
```

#### 建议2: 认证授权
```go
type AuthMiddleware struct {
    apiKeys map[string]Permission
}

func (m *AuthMiddleware) Authenticate(r *http.Request) error {
    key := r.Header.Get("X-API-Key")
    if _, ok := m.apiKeys[key]; !ok {
        return ErrUnauthorized
    }
    return nil
}
```

#### 建议3: 输入验证
```go
func ValidatePath(path string) error {
    cleaned := filepath.Clean(path)
    if strings.Contains(cleaned, "..") {
        return ErrInvalidPath
    }
    return nil
}
```

### 安全评分
- 输入验证: 1/3 (基本没有)
- 权限控制: 0/3 (完全缺失)
- 数据保护: 2/4 (有基本的错误处理)

**小计: 3/10**

## 专家5: 测试专家 - 测试分析

### 测试现状

#### 测试覆盖率
- 主包: 11.0% (严重不足)
- automation包: 26.0% (不足)
- 目标: 至少70%

#### 现有测试
```
automation/screen_test.go
automation/page_screenshot_test.go
automation/vision_test.go
automation/utils_test.go
automation/image_layout_test.go
automation/vision_js_integration_test.go
automation/vision_layout_test.go
automation/js_binary_roundtrip_test.go
```

### 测试问题

#### 1. 缺少单元测试
- 大部分业务逻辑未测试
- HTTP handlers未测试
- 错误处理路径未测试

#### 2. 缺少集成测试
- 端到端流程未测试
- 跨模块交互未测试

#### 3. 测试质量问题
- 测试依赖外部环境 (OCR服务)
- 缺少mock
- 测试数据硬编码

### 测试改进建议

#### 建议1: 测试金字塔
```
E2E Tests (10%)
  ├── 完整脚本执行
  └── HTTP API调用

Integration Tests (30%)
  ├── 模块间交互
  └── 平台特定功能

Unit Tests (60%)
  ├── 业务逻辑
  ├── 工具函数
  └── 错误处理
```

#### 建议2: 测试工具
```go
type MockRuntime struct {
    mock.Mock
}

func (m *MockRuntime) RunString(script string) (goja.Value, error) {
    args := m.Called(script)
    return args.Get(0).(goja.Value), args.Error(1)
}
```

#### 建议3: 测试数据管理
```
testdata/
  ├── scripts/
  ├── screenshots/
  └── fixtures/
```

### 测试评分
- 单元测试: 0.5/2 (覆盖率低)
- 集成测试: 0.5/2 (基本没有)
- E2E测试: 0/1 (完全缺失)

**小计: 1/5**

## 反方专家团 - 风险质疑

### 架构重构风险
**反方观点**: 大规模重构可能导致:
1. 现有功能回归
2. 开发周期延长
3. 引入新bug

**缓解措施**:
1. 渐进式重构，保持向后兼容
2. 增加测试覆盖率后再重构
3. 使用feature flag控制新旧实现

### 性能优化风险
**反方观点**: 过早优化可能:
1. 增加代码复杂度
2. 降低可维护性
3. 收益不明显

**缓解措施**:
1. 先建立性能基准测试
2. 只优化热点路径
3. 保留性能对比数据

### 安全加固风险
**反方观点**: 过度安全限制可能:
1. 影响易用性
2. 限制合法使用场景
3. 增加配置复杂度

**缓解措施**:
1. 提供安全级别配置
2. 默认安全，可选宽松
3. 详细的安全文档

## 第1轮总体评分

### 分项得分
- 架构设计: 12/25 (48%)
- 代码质量: 10/20 (50%)
- 性能优化: 8/15 (53%)
- 可维护性: 8/15 (53%) [估算]
- 安全性: 3/10 (30%)
- 文档完整性: 7/10 (70%) [已有API文档]
- 测试覆盖率: 1/5 (20%)

### 总分计算
```
总分 = (12×0.25 + 10×0.20 + 8×0.15 + 8×0.15 + 3×0.10 + 7×0.10 + 1×0.05) × 100
     = (3.0 + 2.0 + 1.2 + 1.2 + 0.3 + 0.7 + 0.05) × 100
     = 8.45 × 100
     = 8.45 / 10 × 100
     = 49/100
```

**当前总分: 49/100 (不合格)**

## 优先级排序

### P0 - 必须立即解决
1. 增加测试覆盖率 (当前仅11-26%)
2. 修复全局状态并发安全问题
3. 添加基本的安全控制 (认证/授权)

### P1 - 重要但可延后
1. 重构main.go，拆分职责
2. 引入依赖注入
3. 统一错误处理

### P2 - 优化改进
1. 性能优化 (对象池、并发控制)
2. 完善日志系统
3. 改进配置管理

## 下一轮讨论计划

### 第2轮主题: 测试策略设计
- 如何快速提升测试覆盖率到70%+
- 测试框架选型
- Mock策略

### 第3轮主题: 并发安全设计
- 全局状态重构方案
- 运行时池化设计
- 并发测试策略

### 第4轮主题: 安全加固方案
- 沙箱隔离设计
- 认证授权机制
- 输入验证框架

## 可追溯产物

本轮讨论产生的文档:
1. ✅ docs/optimization/00-discussion-framework.md
2. ✅ docs/optimization/round-01-initial-analysis.md

待产生:
3. ⏳ docs/optimization/proposals/P0-testing-strategy.md
4. ⏳ docs/optimization/proposals/P0-concurrency-safety.md
5. ⏳ docs/optimization/proposals/P0-security-hardening.md
