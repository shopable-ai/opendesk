package app

import (
    "fmt"
    "time"
    "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/desktop"
)

// compactStatus is display-only. The verified and fresh HasUpcoming contract
// gates countdowns; historic third-party resets never become future events.
func compactStatus(now time.Time, at *time.Time, hasUpcoming bool, kind string) desktop.MenuStatus {
    out:=desktop.MenuStatus{State:"idle",Label:"下一次时间待公布",Tooltip:"Reset Clock · 下一次时间待公布"}
    switch kind {
    case "error": out.State="error";out.Label="来源暂不可用";out.Tooltip="Reset Clock · 来源异常，下一次时间待公布"
    case "stale": out.State="stale";out.Label="等待来源核验";out.Tooltip="Reset Clock · 来源过期，暂停未来倒计时"
    case "withdrawn": out.State="withdrawn";out.Label="预告已撤回";out.Tooltip="Reset Clock · 原预告已撤回，下一次时间待公布"
    }
    if !hasUpcoming||at==nil||!at.After(now) {return out}
    delta:=at.Sub(now)
    minutes:=int64(delta/time.Minute)
    if delta%time.Minute>0 {minutes++}
    if minutes<1 {minutes=1}
    short:=compactRemaining(minutes)
    out=desktop.MenuStatus{State:"upcoming",ShortRemaining:short,Label:"下一次预计重置",
        Tooltip:"Reset Clock · 来源预告距离重置 "+short+"，不代表个人额度恢复"}
    if kind=="revised" {out.State="revised";out.Label="预告时间已更正";out.Tooltip="Reset Clock · 来源预告已更正，距离重置 "+short}
    if delta<=15*time.Minute {out.State="soon";out.Label="预计重置即将到时";out.Tooltip="Reset Clock · 预计重置即将到时，剩余 "+short}
    return out
}
func compactRemaining(minutes int64)string{
    if minutes<=60{return fmt.Sprintf("%dm",minutes)}
    hours:=minutes/60
    if hours>=24 {return fmt.Sprintf("%dd %dh",hours/24,hours%24)}
    return fmt.Sprintf("%dh%02dm",hours,minutes%60)
}
