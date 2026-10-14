#!/usr/bin/env python3
"""Synthetic R27 screenshot fixture; Python standard library, loopback only.

From the repository root:
    python3 examples/desktop-reset-clock/tests/r27_fixture_server.py
    python3 examples/desktop-reset-clock/tests/r27_fixture_server.py --port 0 \
        --evidence-json .runtime/tests/desktop-reset-clock/r27/startup.json

Read feed_url / web_details_url / control_url from the startup evidence JSON.
POST <control_url>?scene=three|two|one|empty|long|future|stale|withdrawn.
Every POST advances feed_version and every stable item's revision, including
repeated scenes. Removed visible news remains as withdrawn tombstones, per
events.Reconcile/news.Reconcile. GETs only refresh generated_at/source_health;
item contents remain stable until a POST. No external network requests occur.

All timestamps and verification fields describe constructed fixture data, not
upstream verification. Events use user_observation and news uses editorial;
all content explicitly says 【验收模拟】. This is not a real upstream bridge.
"""

import argparse
from datetime import datetime, timedelta, timezone
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading
from urllib.parse import parse_qs, urlsplit


SCENES = ("three", "two", "one", "empty", "long", "future", "stale", "withdrawn")
RUNTIME_ROOT = Path(__file__).resolve().parents[3] / ".runtime"
DEFAULT_EVIDENCE = RUNTIME_ROOT / "tests/desktop-reset-clock/r27/startup.json"
SOURCE_ROOT = "https://example.org/r27-acceptance-synthetic/"
LABEL = "【验收模拟】"


def utc_now():
    return datetime.now(timezone.utc)


def timestamp(value):
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


class FixtureState:
    def __init__(self, base_url, scene):
        self.base_url = base_url
        self.lock = threading.Lock()
        self.created_at = utc_now()
        self.feed_version = 1
        self.scene = scene
        self._build(self.created_at)

    def _build(self, now):
        published = timestamp(self.created_at - timedelta(hours=2))
        updated = timestamp(now)
        effective = now + (timedelta(days=7) if self.scene == "future"
                           else timedelta(minutes=45))
        withdrawn = self.scene == "withdrawn"
        self.events = [{
            "id": "r27-synthetic-reset-001",
            "revision": self.feed_version,
            "type": "reset_announcement",
            "state": "withdrawn" if withdrawn else "active",
            "audience": "public",
            "source_type": "user_observation",
            "source_published_at": published,
            "source_updated_at": updated,
            "effective_at": None if withdrawn else timestamp(effective),
            "verified_at": updated,
            "source_url": SOURCE_ROOT + "reset-001",
            "summary": LABEL + ("虚构的重置公告已撤回；不代表真实上游或个人额度。"
                                if withdrawn else
                                "虚构的未来重置事件；仅测试倒计时，不代表真实上游或个人额度。"),
        }]
        visible = {"two": 2, "one": 1, "empty": 0, "withdrawn": 0}.get(self.scene, 3)
        titles = ("未来重置时间展示", "新闻列表与来源展示", "详情网页与撤回展示")
        self.news = []
        for index, title in enumerate(titles, 1):
            item = {
                "id": "r27-synthetic-news-%03d" % index,
                "revision": self.feed_version,
                "title": LABEL + title,
                "summary": LABEL + "这是一条中文合成新闻，仅用于本地截图验收；不代表官方消息或真实上游。",
                "published_at": published,
                "updated_at": updated,
                "source_url": SOURCE_ROOT + "news-%03d" % index,
                "category": "验收模拟",
                "source_type": "editorial",
                "state": "active" if index <= visible else "withdrawn",
                "verified_at": updated,
            }
            if self.scene == "long":
                item["title"] += "：用于检查中文长标题换行、内容自适应与按钮对齐，所有文字均为合成验收数据" * 2
                item["summary"] += "这段验收模拟文字用于检查长新闻摘要的换行、截断和留白，不表示真实产品变更。" * 8
            self.news.append(item)

    def snapshot(self):
        with self.lock:
            now = utc_now()
            checked = now - timedelta(hours=3) if self.scene == "stale" else now
            return {
                "schema_version": 1,
                "channel_id": "r27-acceptance-synthetic",
                "feed_version": self.feed_version,
                "generated_at": timestamp(now),
                "source_health": {
                    "status": "error" if self.scene == "stale" else "ok",
                    "last_checked_at": timestamp(checked),
                },
                "events": self.events,
                "news": self.news,
                "data_source_url": SOURCE_ROOT,
                "web_details_url": self.base_url + "/reset-clock/",
            }, self.scene

    def switch(self, scene):
        with self.lock:
            self.scene = scene
            self.feed_version += 1
            self._build(utc_now())
            return {"ok": True, "synthetic": True, "label": LABEL,
                    "scene": scene, "feed_version": self.feed_version}


def overview(snapshot, scene):
    """Read-only, server-rendered details: no CDN, remote assets or upstream calls."""
    esc = html.escape
    cards = []
    for item in snapshot["news"]:
        if item["state"] == "active":
            cards.append(
                '<article><h2>%s</h2><p>%s</p><small>编辑合成 · %s · revision %s</small>'
                '<p>来源占位链接：%s（验收合成数据）</p></article>' % (
                    esc(item["title"]), esc(item["summary"]),
                    esc(item["updated_at"]), item["revision"], esc(item["source_url"])))
    event = snapshot["events"][0]
    health = snapshot["source_health"]
    return """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>【验收模拟】Reset Clock 本地详情</title>
<style>
body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f5f7fb;color:#172033}
main{max-width:880px;margin:24px auto;padding:0 24px 32px;overflow-wrap:anywhere}
.banner{background:#fff0b3;border:3px solid #9a6200;border-radius:10px;padding:18px}
.banner strong{display:block;font-size:24px;color:#704600}
article,.status{background:white;border:1px solid #d8deea;border-radius:10px;padding:18px;margin-top:16px}
h1{font-size:26px}h2{font-size:19px;margin:0 0 8px}p{margin:8px 0}small{color:#536077}
code{background:#eaf0fa;padding:2px 5px}a{color:#174d91}
</style></head><body><main>
<div class="banner"><strong>【验收模拟】仅用于本地截图测试</strong>
所有事件、新闻、时间与验证记录均为合成数据，不代表真实上游、官方公告或个人额度。</div>
<h1>Reset Clock · 可验证本地详情网页</h1>
<div class="status"><p>场景：<code>%s</code> · feed_version：<code>%s</code></p>
<p>模拟来源健康：<code>%s</code> · 最后模拟检查：%s</p>
<p>%s</p><p>事件状态：%s · 预计时间：%s</p>
<p>事件来源类型：用户观察合成数据 · revision：%s</p>
<p><a href="/feed">查看当前合法 Snapshot JSON</a></p></div>
%s
<p>此网页只读；场景通过本地 POST /control?scene=... 切换。刷新本页查看当前场景。</p>
</main></body></html>""" % (
        esc(scene), snapshot["feed_version"], esc(health["status"]),
        esc(health["last_checked_at"]), esc(event["summary"]), esc(event["state"]),
        esc(event["effective_at"] or "已撤回，无有效未来时间"), event["revision"],
        "".join(cards) or '<article><h2>【验收模拟】暂无有效新闻</h2><p>原有记录保留为 withdrawn 墓碑。</p></article>')


class FixtureServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, scene):
        super().__init__(("127.0.0.1", port), FixtureHandler)
        self.base_url = "http://127.0.0.1:%d" % self.server_address[1]
        self.fixture = FixtureState(self.base_url, scene)


class FixtureHandler(BaseHTTPRequestHandler):
    server_version = "R27SyntheticFixture/1"

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, _format, *args):
        # Keep screenshot harness output limited to the startup JSON.
        pass

    def reply(self, status, body, content_type="application/json; charset=utf-8", allow=None):
        if isinstance(body, dict):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
        if allow:
            self.send_header("Allow", allow)
        self.end_headers()
        self.wfile.write(body)

    def local_request(self):
        # A loopback bind alone does not prevent browser DNS rebinding/CSRF.
        authority = self.server.base_url.removeprefix("http://")
        if self.client_address[0] != "127.0.0.1" or self.headers.get("Host") != authority:
            self.close_connection = True
            self.reply(403, {"error": "require bound 127.0.0.1 authority"})
            return False
        return True

    def do_GET(self):
        if not self.local_request():
            return
        path = urlsplit(self.path).path
        if path in ("/feed", "/reset-clock/"):
            snapshot, scene = self.server.fixture.snapshot()
            if path == "/feed":
                self.reply(200, snapshot)
            else:
                self.reply(200, overview(snapshot, scene), "text/html; charset=utf-8")
        elif path == "/control":
            self.reply(405, {"error": "use POST"}, allow="POST")
        else:
            self.reply(404, {"error": "unknown fixture route"})

    def do_POST(self):
        if not self.local_request():
            return
        # No bodies or pipelined bytes are used by this query-only control API.
        self.close_connection = True
        target = urlsplit(self.path)
        if target.path != "/control":
            self.reply(405 if target.path in ("/feed", "/reset-clock/") else 404,
                       {"error": "use POST /control?scene=..."},
                       allow="GET" if target.path in ("/feed", "/reset-clock/") else None)
            return
        origin = self.headers.get("Origin")
        if ((origin is not None and origin != self.server.base_url)
                or self.headers.get("Sec-Fetch-Site") == "cross-site"):
            self.reply(403, {"error": "cross-origin control denied"})
            return
        query = parse_qs(target.query, keep_blank_values=True)
        scene = query.get("scene", [])
        if set(query) != {"scene"} or len(scene) != 1 or scene[0] not in SCENES:
            self.reply(400, {"error": "require exactly one valid scene", "scenes": SCENES})
            return
        self.reply(200, self.server.fixture.switch(scene[0]))


def write_evidence(path, evidence):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".r27-startup-", suffix=".json", delete=False) as output:
            temporary = Path(output.name)
            json.dump(evidence, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=0, help="127.0.0.1 port; 0 chooses a random available port")
    parser.add_argument("--scene", choices=SCENES, default="three")
    parser.add_argument("--evidence-json", type=Path, default=DEFAULT_EVIDENCE,
                        help="startup evidence JSON inside the repository .runtime directory")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    evidence_path = args.evidence_json.resolve()
    if not evidence_path.is_relative_to(RUNTIME_ROOT.resolve()):
        parser.error("--evidence-json must be inside %s" % RUNTIME_ROOT)
    with FixtureServer(args.port, args.scene) as server:
        evidence = {
            "synthetic": True, "label": LABEL, "pid": os.getpid(),
            "host": "127.0.0.1", "port": server.server_address[1],
            "url": server.base_url + "/feed", "feed_url": server.base_url + "/feed",
            "web_details_url": server.base_url + "/reset-clock/",
            "control_url": server.base_url + "/control",
            "scene": args.scene, "feed_version": 1, "scenes": SCENES,
            "started_at": timestamp(server.fixture.created_at),
            "evidence_json": str(evidence_path),
        }
        write_evidence(evidence_path, evidence)
        print(json.dumps(evidence, ensure_ascii=False), flush=True)
        try:
            server.serve_forever(poll_interval=0.2)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
