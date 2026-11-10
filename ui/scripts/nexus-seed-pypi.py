"""Seed locked Python distributions into the company's Nexus PyPI hosted repository.

By default this prints the planned artifacts. Set NEXUS_USER and NEXUS_PASSWORD in the
environment, then pass --upload to download, hash-check, and publish them.

  python ui/scripts/nexus-seed-pypi.py
  python ui/scripts/nexus-seed-pypi.py --upload
  python ui/scripts/nexus-seed-pypi.py --services-dir E:/Projects/services --upload

The default target matches the service Dockerfiles: CPython 3.13, Linux x86_64 (glibc).
NEXUS_CA_BUNDLE may point to the company's CA PEM file if it is not in Python's trust store.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html.parser
import os
import re
import ssl
import subprocess
import sys
import tempfile
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path


NEXUS_URL = os.environ.get("NEXUS_URL", "https://nexus.digitalx.srt").rstrip("/")
NEXUS_REPOSITORY = "pypi-hosted"
PYTHON_TAG = "cp313"
LINUX_GLIBC_MAX = (2, 36)  # Debian 12 / bookworm


@dataclass(frozen=True)
class Artifact:
    name: str
    version: str
    url: str
    sha256: str
    filename: str


class LinkParser(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)


def nexus_context() -> ssl.SSLContext:
    ca_bundle = os.environ.get("NEXUS_CA_BUNDLE")
    return ssl.create_default_context(cafile=ca_bundle or None)


def auth_header() -> str:
    user = os.environ["NEXUS_USER"]
    password = os.environ["NEXUS_PASSWORD"]
    value = base64.b64encode(f"{user}:{password}".encode()).decode("ascii")
    return f"Basic {value}"


def request(url: str, data: bytes | None = None, headers: dict[str, str] | None = None,
            *, nexus_auth: bool = False) -> bytes:
    request_headers = dict(headers or {})
    if nexus_auth:
        request_headers["Authorization"] = auth_header()
    req = urllib.request.Request(url, data=data, headers=request_headers)
    context = nexus_context() if url.startswith(NEXUS_URL) else None
    with urllib.request.urlopen(req, context=context, timeout=180) as response:
        return response.read()


def normalize_name(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower()


def lock_files(services_dir: Path) -> list[Path]:
    candidates = [
        services_dir / "uv.lock",
        services_dir / "primary-service" / "uv.lock",
        services_dir / "curing-service" / "uv.lock",
        services_dir / "inspection-service" / "uv.lock",
    ]
    missing = [str(path) for path in candidates if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing lock file(s): " + ", ".join(missing))
    return candidates


def wheel_score(filename: str) -> int | None:
    """Return compatibility score for CPython 3.13 / Linux x86_64, or None."""
    if not filename.endswith(".whl"):
        return None
    parts = filename[:-4].rsplit("-", 3)
    if len(parts) != 4:
        return None
    _, python_tags, abi_tags, platform_tags = parts
    pythons = python_tags.split(".")
    abis = abi_tags.split(".")

    if PYTHON_TAG in pythons and (PYTHON_TAG in abis or "abi3" in abis or "none" in abis):
        python_score = 100
    elif "abi3" in abis and any(
        tag.startswith("cp") and tag[2:].isdigit() and int(tag[2:]) <= 313
        for tag in pythons
    ):
        python_score = 80
    elif "py3" in pythons and "none" in abis:
        python_score = 60
    else:
        return None

    platform_score: int | None = None
    for platform_tag in platform_tags.split("."):
        if platform_tag == "any":
            platform_score = max(platform_score or 0, 1000)
        elif platform_tag == "linux_x86_64":
            platform_score = max(platform_score or 0, 1)
        elif platform_tag.startswith("manylinux_") and platform_tag.endswith("_x86_64"):
            match = re.match(r"manylinux_(\d+)_(\d+)_x86_64$", platform_tag)
            if match:
                glibc = (int(match.group(1)), int(match.group(2)))
                if glibc <= LINUX_GLIBC_MAX:
                    platform_score = max(platform_score or 0, 10 + glibc[0] * 100 + glibc[1])
        elif platform_tag.startswith("manylinux201") and platform_tag.endswith("_x86_64"):
            year = re.match(r"manylinux(\d+)_x86_64$", platform_tag)
            if year:
                glibc_minor = {"2010": 12, "2014": 17}.get(year.group(1))
                if glibc_minor:
                    platform_score = max(platform_score or 0, 10 + 200 + glibc_minor)

    if platform_score is None:
        return None
    return platform_score * 1000 + python_score


def sha256_from_lock(entry: dict) -> str | None:
    value = entry.get("hash")
    if value and value.startswith("sha256:"):
        return value.removeprefix("sha256:")
    return None


def collect_artifacts(files: list[Path]) -> list[Artifact]:
    choices: dict[tuple[str, str], tuple[int, Artifact]] = {}
    unsupported: set[tuple[str, str]] = set()
    for lock_path in files:
        lock = tomllib.loads(lock_path.read_text(encoding="utf-8"))
        for package in lock.get("package", []):
            source = package.get("source", {})
            if "registry" not in source:
                continue  # local project and private Git SDK are handled separately
            name, version = package["name"], package["version"]
            candidate: tuple[int, Artifact] | None = None
            for wheel in package.get("wheels", []):
                filename = Path(urllib.parse.unquote(urllib.parse.urlparse(wheel["url"]).path)).name
                score = wheel_score(filename)
                digest = sha256_from_lock(wheel)
                if score is not None and digest:
                    artifact = Artifact(name, version, wheel["url"], digest, filename)
                    if candidate is None or score > candidate[0]:
                        candidate = (score, artifact)
            if candidate is None:
                sdist = package.get("sdist")
                if sdist and (digest := sha256_from_lock(sdist)):
                    filename = Path(urllib.parse.unquote(urllib.parse.urlparse(sdist["url"]).path)).name
                    candidate = (0, Artifact(name, version, sdist["url"], digest, filename))
            if candidate is None:
                unsupported.add((normalize_name(name), version))
                continue
            key = (normalize_name(name), version)
            old = choices.get(key)
            if old is None or candidate[0] > old[0]:
                choices[key] = candidate
    selected_names = {name for name, _ in choices}
    for name, version in sorted(unsupported):
        if name not in selected_names:
            print(f"No Linux CPython 3.13 artifact found: {name}=={version}", file=sys.stderr)
    return [item[1] for item in sorted(choices.values(), key=lambda pair: pair[1].filename)]


def package_version_present(name: str, version: str) -> bool:
    project = urllib.parse.quote(normalize_name(name), safe="")
    url = f"{NEXUS_URL}/repository/{NEXUS_REPOSITORY}/simple/{project}/"
    try:
        data = request(url, nexus_auth=True)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False
        raise
    parser = LinkParser()
    parser.feed(data.decode("utf-8", errors="replace"))
    expected_prefix = normalize_name(f"{name}-{version}")
    for link in parser.links:
        filename = urllib.parse.unquote(urllib.parse.urlparse(link).path.rsplit("/", 1)[-1])
        normalized_filename = normalize_name(filename)
        if normalized_filename.startswith(expected_prefix):
            suffix = normalized_filename[len(expected_prefix):len(expected_prefix) + 1]
            if not suffix or suffix in {"-", "."}:
                return True
    return False


def multipart(filename: str, content: bytes) -> tuple[bytes, str]:
    boundary = hashlib.sha256(os.urandom(32)).hexdigest()
    chunks = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"pypi.asset\"; "
        f"filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode()
    ]
    chunks.extend((content, f"\r\n--{boundary}--\r\n".encode()))
    return b"".join(chunks), boundary


def upload_artifact(artifact: Artifact) -> None:
    data = request(artifact.url)
    actual = hashlib.sha256(data).hexdigest()
    if actual.lower() != artifact.sha256.lower():
        raise ValueError(f"SHA-256 mismatch for {artifact.filename}")
    body, boundary = multipart(artifact.filename, data)
    endpoint = f"{NEXUS_URL}/service/rest/v1/components?repository={NEXUS_REPOSITORY}"
    try:
        request(endpoint, body, {"Content-Type": f"multipart/form-data; boundary={boundary}"},
                nexus_auth=True)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace").strip()
        message = detail[:500] if detail else error.reason
        raise RuntimeError(f"Nexus HTTP {error.code}: {message}") from error


def sdk_wheel(services_dir: Path, output_dir: Path) -> Artifact:
    result = subprocess.run(
        ["uv", "build", str(services_dir), "--wheel", "--out-dir", str(output_dir)],
        check=True,
        capture_output=True,
        text=True,
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    wheels = list(output_dir.glob("*.whl"))
    if len(wheels) != 1:
        raise RuntimeError(f"Expected one SDK wheel in {output_dir}, found {len(wheels)}")
    wheel = wheels[0]
    match = re.match(r"factory_platform_sdk-(.+?)-", wheel.name, re.IGNORECASE)
    if not match:
        raise RuntimeError(f"Could not read SDK version from {wheel.name}")
    return Artifact(
        "factory-platform-sdk", match.group(1), wheel.as_uri(),
        hashlib.sha256(wheel.read_bytes()).hexdigest(), wheel.name,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--services-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2].parent / "services",
        help="E:/Projects/services checkout containing the four uv.lock files",
    )
    parser.add_argument("--upload", action="store_true", help="download and upload artifacts")
    parser.add_argument("--skip-sdk", action="store_true", help="do not build/upload factory-platform-sdk")
    parser.add_argument("--verbose", action="store_true", help="print each planned distribution")
    args = parser.parse_args()
    services_dir = args.services_dir.resolve()
    files = lock_files(services_dir)
    artifacts = collect_artifacts(files)
    if not args.skip_sdk:
        print(f"SDK wheel: will build from {services_dir}")
    print(f"Target: CPython 3.13 / Linux x86_64 (glibc <= 2.36)")
    print(f"Locked third-party distributions selected: {len(artifacts)}")
    if args.verbose:
        for artifact in artifacts:
            print(f"  {artifact.name}=={artifact.version}  {artifact.filename}")
    if not args.upload:
        print("Dry run only. Set NEXUS_USER and NEXUS_PASSWORD, then rerun with --upload.")
        return 0
    if not (os.environ.get("NEXUS_USER") and os.environ.get("NEXUS_PASSWORD")):
        print("Set NEXUS_USER and NEXUS_PASSWORD in this shell first.", file=sys.stderr)
        return 2

    failed: list[tuple[str, str, str]] = []
    with tempfile.TemporaryDirectory(prefix="nexus-pypi-seed-") as temp:
        if not args.skip_sdk:
            try:
                artifacts.append(sdk_wheel(services_dir, Path(temp)))
            except Exception as error:
                print(f"SDK build failed: {error}", file=sys.stderr)
                return 1
        missing: list[Artifact] = []
        for artifact in artifacts:
            try:
                if package_version_present(artifact.name, artifact.version):
                    print(f"already present {artifact.name}=={artifact.version}")
                else:
                    missing.append(artifact)
            except Exception as error:
                print(f"Nexus lookup failed for {artifact.name}=={artifact.version}: {error}",
                      file=sys.stderr)
                return 1
        print(f"{len(artifacts) - len(missing)} already present, {len(missing)} to upload")
        for index, artifact in enumerate(missing, 1):
            try:
                upload_artifact(artifact)
                print(f"[{index}/{len(missing)}] uploaded {artifact.name}=={artifact.version}")
            except Exception as error:
                failed.append((artifact.name, artifact.version, str(error)))
                print(f"[{index}/{len(missing)}] FAILED {artifact.name}=={artifact.version}: {error}")
    print(f"Finished: {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
