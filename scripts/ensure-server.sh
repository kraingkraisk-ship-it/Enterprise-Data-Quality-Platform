#!/bin/bash
# ตรวจ dev server — ถ้าตาย restart ด้วย watchdog (กัน sandbox reaper)
if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/; then
  pkill -f "while true; do cd /home/z/my-project" 2>/dev/null
  pkill -f "next dev" 2>/dev/null
  sleep 1
  setsid nohup bash -c 'while true; do cd /home/z/my-project && bun run dev >> dev.log 2>&1; sleep 1; done' > /dev/null 2>&1 < /dev/null &
  for i in $(seq 1 30); do
    sleep 2
    curl -s -o /dev/null --max-time 3 http://localhost:3000/ && break
  done
fi
curl -s -o /dev/null -w "server: %{http_code}\n" --max-time 10 http://localhost:3000/
