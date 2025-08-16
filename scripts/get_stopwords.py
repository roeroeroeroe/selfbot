#!/usr/bin/env python3

import os
import shutil
import subprocess
import sys
import tempfile
import venv

OUT_FILE = "stopwords.json"

NLTK_TO_ISO = {
	"albanian": "sq",
	"arabic": "ar",
	"azerbaijani": "az",
	"basque": "eu",
	"belarusian": "be",
	"bengali": "bn",
	"catalan": "ca",
	"chinese": "zh",
	"danish": "da",
	"dutch": "nl",
	"english": "en",
	"finnish": "fi",
	"french": "fr",
	"german": "de",
	"greek": "el",
	"hebrew": "he",
	"hungarian": "hu",
	"indonesian": "id",
	"italian": "it",
	"kazakh": "kk",
	"nepali": "ne",
	"norwegian": "no",
	"portuguese": "pt",
	"romanian": "ro",
	"russian": "ru",
	"slovene": "sl",
	"spanish": "es",
	"swedish": "sv",
	"tajik": "tg",
	"tamil": "ta",
	"turkish": "tr"
}

def fatal(msg):
	print(msg, file=sys.stderr)
	sys.exit(1)

venv_dir = tempfile.mkdtemp(prefix="nltk_venv_")
try:
	venv.create(venv_dir, with_pip=True)
except Exception as e:
	fatal(f"venv.create({venv_dir}): {e}")

python_path = os.path.join(venv_dir, "bin", "python")

try:
	subprocess.run([python_path, "-m", "pip", "install", "nltk"], check=True)
except subprocess.CalledProcessError as e:
	shutil.rmtree(venv_dir, ignore_errors=True)
	fatal(f"pip install nltk: {e}")

extraction_code = f"""
import json
import nltk
import os
import sys
import tempfile
import shutil
from nltk.corpus import stopwords

nltk_temp_dir = tempfile.mkdtemp()
nltk.data.path = [nltk_temp_dir]
os.environ["NLTK_DATA"] = nltk_temp_dir

try:
	nltk.download("stopwords", download_dir=nltk_temp_dir, quiet=True)
except Exception as e:
	print(f"nltk.download: {{e}}", file=sys.stderr)
	shutil.rmtree(nltk_temp_dir, ignore_errors=True)
	raise SystemExit(1)

OUT_FILE = {repr(OUT_FILE)}
NLTK_TO_ISO = {repr(NLTK_TO_ISO)}
data = {{}}

for lang in NLTK_TO_ISO:
	iso = NLTK_TO_ISO[lang]
	try:
		words = stopwords.words(lang)
		words = [w for w in words if " " not in w]
		words = sorted(set(words))
		if not words:
			continue
		data[iso] = words
	except Exception as e:
		print(f"{{iso}} ({{lang}}): {{e}}", file=sys.stderr)

if not data:
	print("no valid stopwords", file=sys.stderr)
	shutil.rmtree(nltk_temp_dir, ignore_errors=True)
	raise SystemExit(1)

with open(OUT_FILE, "w", encoding="utf-8") as f:
	json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

shutil.rmtree(nltk_temp_dir, ignore_errors=True)
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
