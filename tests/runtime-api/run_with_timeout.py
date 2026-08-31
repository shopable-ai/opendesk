#!/usr/bin/env python3
"""Run one Runtime API test process with a wall-clock deadline and group cleanup."""

import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys


def stop_group(process, sig):
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, sig)
    except ProcessLookupError:
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", required=True, type=float)
    parser.add_argument("--pid-file", type=Path)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("a command is required after --")

    process = subprocess.Popen(command, start_new_session=True)
    if args.pid_file:
        args.pid_file.parent.mkdir(parents=True, exist_ok=True)
        args.pid_file.write_text(
            json.dumps(
                {
                    "runtimePid": process.pid,
                    "processGroupId": process.pid,
                    "watchdogPid": os.getpid(),
                    "command": command,
                }
            ),
            encoding="utf-8",
        )

    def forward(signum, _frame):
        stop_group(process, signum)

    signal.signal(signal.SIGINT, forward)
    signal.signal(signal.SIGTERM, forward)
    try:
        return process.wait(timeout=args.seconds)
    except subprocess.TimeoutExpired:
        print(
            f"Runtime API test exceeded wall-clock deadline ({args.seconds:g}s): {' '.join(command)}",
            file=sys.stderr,
        )
        stop_group(process, signal.SIGTERM)
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            stop_group(process, signal.SIGKILL)
            process.wait()
        return 124
    finally:
        if process.poll() is None:
            stop_group(process, signal.SIGTERM)


if __name__ == "__main__":
    raise SystemExit(main())
