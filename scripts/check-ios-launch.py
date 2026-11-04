import os
import re
import subprocess
import sys
import time

simulator, bundle = sys.argv[1:]
result = subprocess.run(['xcrun', 'simctl', 'launch', '--terminate-running-process', simulator, bundle], text=True, capture_output=True, check=True)
pid = int(re.search(r': (\d+)\s*$', result.stdout).group(1))
time.sleep(3)
try:
    os.kill(pid, 0)
except ProcessLookupError:
    raise SystemExit(f'FAIL: {bundle} exited within 3 seconds of launch (pid {pid}).')
print(f'PASS: {bundle} remains running after launch (pid {pid}).')
