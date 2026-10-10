package main

import (
	"context"
	"fmt"
	"log"
	"opendesk/internal/browserbridge"
	"opendesk/pkg/appshell"
	"os"
	"strings"
	"sync"
)

// Product-owned registration/grants never start a Runtime or browser operation.
func configureAppBrowser(ctx context.Context, shell *appshell.Shell, host appshell.NativeHost, product bool) func(string) {
	if !product {
		return nil
	}
	promptHost, ok := host.(appshell.BrowserPromptHost)
	if !ok {
		return nil
	}
	var dialogs sync.Mutex
	pairing := &browserbridge.PairingService{}
	show := func(message string) {
		_, err := promptHost.BrowserPrompt(ctx, appshell.BrowserPrompt{Kind: "status", Message: message})
		if err != nil {
			log.Printf("[BROWSER_SETUP] dialog error=%v", err)
		}
	}
	err := shell.BindBrowserAction(func(event appshell.ActionEvent) error {
		if !dialogs.TryLock() {
			return fmt.Errorf("Browser dialog already open")
		}
		go func() {
			defer dialogs.Unlock()
			switch event.ID {
			case appshell.ActionBrowserStatus:
				doctor := browserbridge.Doctor()
				if doctor["installed"] == true && doctor["error"] == nil {
					show("Native Host 已登记。请在扩展中连接并授予 Native 权限。\n\n登记不代表浏览器已连接或项目已授权。当前只支持一个活动 Host；另一 Profile 需先释放连接。")
				} else {
					show("尚不能确认可信 Host 已就绪。开发版请在扩展设置点击配对，核对原生确认窗口。旧 Node 安装需使用高级迁移流程。\n\n诊断：" + fmt.Sprint(doctor["error"]))
				}
			case appshell.ActionBrowserProjectAdd:
				if _, err := browserbridge.Load(); err != nil {
					show("请先完成可信 Go Host 配对，再授权文件。\n\n诊断：" + err.Error())
					return
				}
				choice, err := promptHost.BrowserPrompt(ctx, appshell.BrowserPrompt{Kind: "add-project"})
				if err != nil {
					show("文件选择失败：" + err.Error())
					return
				}
				if !choice.Approved {
					return
				}
				if err = ctx.Err(); err != nil {
					return
				}
				_, err = browserbridge.ProjectAdd(choice.Path, choice.RuntimeKind, choice.EntryFormat, choice.SiteOrigin)
				if err != nil {
					show("未授权此文件。请检查类型、网站 Origin 与文件安全性。\n\n诊断：" + err.Error())
					return
				}
				show("文件已授权。打开 Sidebar 本地项目模式并刷新，检查源码后明确点击运行。此操作没有运行脚本。")
			case appshell.ActionBrowserProjectRevoke:
				state, err := browserbridge.ProjectList()
				if err != nil {
					show("不能读取项目授权：" + err.Error())
					return
				}
				rows, _ := state["projects"].([]map[string]any)
				projects := make([]appshell.BrowserProject, 0, len(rows))
				for _, row := range rows {
					id, _ := row["bindingId"].(string)
					name, _ := row["name"].(string)
					projects = append(projects, appshell.BrowserProject{BindingID: id, Name: name})
				}
				choice, err := promptHost.BrowserPrompt(ctx, appshell.BrowserPrompt{Kind: "revoke-project", Projects: projects})
				if err != nil {
					show("撤权未完成：" + err.Error())
					return
				}
				if !choice.Approved {
					return
				}
				if err = ctx.Err(); err != nil {
					return
				}
				if _, err = browserbridge.ProjectRevoke(choice.BindingID); err != nil {
					show("撤权失败：" + err.Error())
					return
				}
				show("文件授权已撤销。已有运行保留原冻结源码；后续解析拒绝此绑定。")
			}
		}()
		return nil
	})
	if err != nil {
		log.Printf("[BROWSER_SETUP] action binding error=%v", err)
		return nil
	}
	return func(raw string) {
		if !dialogs.TryLock() {
			log.Printf("[BROWSER_SETUP] pairing blocked: dialog busy")
			return
		}
		defer dialogs.Unlock()
		result, err := pairing.Handle(ctx, raw, func(ctx context.Context, intent browserbridge.PairingIntent) (bool, error) {
			choice, err := promptHost.BrowserPrompt(ctx, appshell.BrowserPrompt{Kind: "pair", ExtensionID: intent.ExtensionID, DeadlineMillis: intent.IssuedAt.Add(browserbridge.PairingLifetime).UnixMilli()})
			return choice.Approved, err
		})
		if err != nil {
			if strings.HasPrefix(err.Error(), "E_PAIRING_") {
				log.Printf("[BROWSER_SETUP] rejected pairing request error=%v", err)
				return
			}
			show("开发版配对未完成。申请可能已过期、已消费，或与现有 Host 安装冲突。\n\n诊断：" + err.Error())
			return
		}
		if result["paired"] == true {
			show("Native Host 已登记。返回浏览器点击「检测连接」；必要时先结束运行并重新加载扩展。文件与网站仍需分别授权。")
		}
	}
}

func isBrowserPairingIntent(raw string) bool {
	return strings.HasPrefix(raw, "opendesk://browser-pair")
}
func prepareAppBrowser(ctx context.Context) {
	// Startup does not prove that a new executable is a trusted installer.
	// Keep an existing authenticated registration; only explicit setup/update
	// may move it to another executable. Never implicitly migrate legacy Node.
	if _, err := browserbridge.Load(); err == nil {
		return
	} else if !os.IsNotExist(err) {
		log.Printf("[BROWSER_SETUP] existing registration unavailable error=%v", err)
		return
	}
	if _, err := browserbridge.SetupAutomaticContext(ctx, "", "", "", ""); err != nil {
		log.Printf("[BROWSER_SETUP] automatic registration unavailable error=%v", err)
	}
}
