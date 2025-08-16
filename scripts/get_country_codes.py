#!/usr/bin/env python3

import os
import shutil
import subprocess
import sys
import tempfile
import venv
import json

OUT_FILE = "country_codes.json"

def fatal(msg):
	print(msg, file=sys.stderr)
	sys.exit(1)

venv_dir = tempfile.mkdtemp(prefix="pycountry_venv_")
try:
	venv.create(venv_dir, with_pip=True)
except Exception as e:
	fatal(f"venv.create({venv_dir}): {e}")

python_path = os.path.join(venv_dir, "bin", "python")

try:
	subprocess.run([python_path, "-m", "pip", "install", "pycountry"], check=True)
except subprocess.CalledProcessError as e:
	shutil.rmtree(venv_dir, ignore_errors=True)
	fatal(f"pip install pycountry: {e}")

extraction_code = f"""
import json
import sys
import pycountry

OUT_FILE = {repr(OUT_FILE)}
data = {{}}

for c in pycountry.countries:
	code = getattr(c, "alpha_2", None)
	if not code:
		continue
	name = getattr(c, "official_name", None) or getattr(c, "name", None) or getattr(c, "common_name", None)
	if name:
		data[code.upper()] = name

out = {{k: data[k] for k in sorted(data.keys())}}

with open(OUT_FILE, "w", encoding="utf-8") as f:
	json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
"""

with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as tmp:
	tmp.write(extraction_code)
	temp_script_path = tmp.name

try:
	subprocess.run([python_path, temp_script_path], check=True)
except subprocess.CalledProcessError as e:
	fatal(f"extraction script: {e}")
finally:
	shutil.rmtree(venv_dir, ignore_errors=True)
	os.unlink(temp_script_path)
