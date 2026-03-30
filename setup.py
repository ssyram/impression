#!/usr/bin/env python3
"""
Impression System — Setup Script

Cross-platform installer that:
  1. Checks for / installs pi (the coding agent)
  2. Interactively guides API key configuration (skippable)
  3. Installs the impression extension into pi (skippable)

Supports macOS, Linux, and Windows.
"""

import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def heading(text: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}\n")


def info(text: str) -> None:
    print(f"  [*] {text}")


def warn(text: str) -> None:
    print(f"  [!] {text}")


def error(text: str) -> None:
    print(f"  [ERROR] {text}", file=sys.stderr)


def ask_yes_no(prompt: str, default: bool = True) -> bool:
    suffix = " [Y/n] " if default else " [y/N] "
    while True:
        answer = input(f"  {prompt}{suffix}").strip().lower()
        if answer == "":
            return default
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False


def ask_input(prompt: str, default: str = "") -> str:
    display = f"  {prompt}"
    if default:
        display += f" [{default}]"
    display += ": "
    answer = input(display).strip()
    return answer if answer else default


def which(cmd: str) -> str | None:
    return shutil.which(cmd)


def run(cmd: list[str], check: bool = True, capture: bool = False, **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, capture_output=capture, text=True, **kwargs)


def impression_dir() -> Path:
    """Return the directory where this setup.py lives (== impression root)."""
    return Path(__file__).resolve().parent


# ---------------------------------------------------------------------------
# Step 1: Ensure pi is installed
# ---------------------------------------------------------------------------

def ensure_pi() -> bool:
    heading("Step 1: Check pi installation")

    if which("pi"):
        try:
            result = run(["pi", "--version"], capture=True, check=False)
            version = result.stdout.strip() or result.stderr.strip()
            info(f"pi is already installed: {version}")
            return True
        except Exception:
            info("pi binary found but could not determine version.")
            return True

    warn("pi is not installed.")
    if not ask_yes_no("Install pi via npm now?"):
        warn("Skipping pi installation. You can install it manually:")
        info("  npm install -g @mariozechner/pi-coding-agent")
        return False

    # Check for npm
    if not which("npm"):
        error("npm is not installed. Please install Node.js (https://nodejs.org) first.")
        return False

    info("Installing pi globally via npm...")
    try:
        run(["npm", "install", "-g", "@mariozechner/pi-coding-agent"])
        info("pi installed successfully.")
        return True
    except subprocess.CalledProcessError as e:
        error(f"npm install failed (exit code {e.returncode}).")
        warn("Try running manually: npm install -g @mariozechner/pi-coding-agent")
        return False


# ---------------------------------------------------------------------------
# Step 2: Configure API provider
# ---------------------------------------------------------------------------

PROVIDERS = [
    ("ANTHROPIC_API_KEY",   "Anthropic (Claude)"),
    ("OPENAI_API_KEY",      "OpenAI (GPT)"),
    ("GOOGLE_API_KEY",      "Google (Gemini)"),
    ("OPENROUTER_API_KEY",  "OpenRouter"),
]


def get_shell_profile() -> Path:
    """Best-effort guess for the user's shell profile."""
    system = platform.system()
    home = Path.home()
    if system == "Windows":
        # PowerShell profile
        ps_profile = home / "Documents" / "PowerShell" / "Microsoft.PowerShell_profile.ps1"
        if ps_profile.parent.exists():
            return ps_profile
        return home / ".bashrc"  # Git Bash / WSL fallback
    shell = os.environ.get("SHELL", "/bin/bash")
    if "zsh" in shell:
        return home / ".zshrc"
    if "fish" in shell:
        return home / ".config" / "fish" / "config.fish"
    return home / ".bashrc"


def configure_api_keys() -> None:
    heading("Step 2: Configure LLM API keys")

    info("pi needs at least one LLM provider API key to work.")
    info("You can skip this step and set environment variables manually later.\n")

    if not ask_yes_no("Configure API keys now?"):
        warn("Skipping API key configuration.")
        info("Set one of these environment variables before running pi:")
        for env_var, label in PROVIDERS:
            info(f"  export {env_var}=<your-key>    # {label}")
        return

    print()
    for i, (env_var, label) in enumerate(PROVIDERS, 1):
        existing = os.environ.get(env_var, "")
        status = " (already set)" if existing else ""
        print(f"    {i}. {label}{status}")
    print(f"    {len(PROVIDERS) + 1}. Other / custom provider URL")
    print()

    chosen_env_var = None
    chosen_value = None
    custom_url = None

    choice = ask_input("Select a provider (number)", "1")
    try:
        idx = int(choice)
    except ValueError:
        idx = 1

    if 1 <= idx <= len(PROVIDERS):
        env_var, label = PROVIDERS[idx - 1]
        existing = os.environ.get(env_var, "")
        if existing:
            info(f"{env_var} is already set. Skipping.")
            return
        value = ask_input(f"Enter your {label} API key")
        if not value:
            warn("No key entered. Skipping.")
            return
        chosen_env_var = env_var
        chosen_value = value
    elif idx == len(PROVIDERS) + 1:
        custom_url = ask_input("Enter your provider base URL (e.g. http://localhost:11434)")
        env_var_name = ask_input("Environment variable name for the API key (leave empty if none)")
        if env_var_name:
            value = ask_input(f"Enter the API key for {env_var_name}")
            if value:
                chosen_env_var = env_var_name
                chosen_value = value
    else:
        warn("Invalid choice. Skipping.")
        return

    # Persist to shell profile
    if chosen_env_var and chosen_value:
        profile = get_shell_profile()
        if ask_yes_no(f"Append export to {profile}?"):
            system = platform.system()
            if system == "Windows" and "PowerShell" in str(profile):
                line = f'\n$env:{chosen_env_var} = "{chosen_value}"\n'
            elif "fish" in str(profile):
                line = f'\nset -gx {chosen_env_var} "{chosen_value}"\n'
            else:
                line = f'\nexport {chosen_env_var}="{chosen_value}"\n'

            with open(profile, "a") as f:
                f.write(line)
            info(f"Appended to {profile}")
            info(f"Run `source {profile}` or open a new terminal to activate.")
            # Also set for current process so step 3 can use pi
            os.environ[chosen_env_var] = chosen_value
        else:
            info(f"You can add it manually:")
            info(f'  export {chosen_env_var}="{chosen_value}"')
            os.environ[chosen_env_var] = chosen_value

    if custom_url:
        info(f"\nTo use a custom provider, run pi with:")
        info(f"  pi --provider openai-compatible --api-url {custom_url}")


# ---------------------------------------------------------------------------
# Step 3: Install the impression extension
# ---------------------------------------------------------------------------

def install_extension() -> None:
    heading("Step 3: Install impression extension")

    ext_dir = impression_dir()
    index_file = ext_dir / "index.ts"
    if not index_file.exists():
        error(f"Cannot find {index_file}. Make sure setup.py is in the impression directory.")
        return

    info(f"Extension directory: {ext_dir}")

    if not which("pi"):
        warn("pi is not installed. Cannot register extension automatically.")
        info("After installing pi, run:")
        info(f"  pi install {ext_dir}")
        return

    if not ask_yes_no("Install impression extension into pi now?"):
        warn("Skipping extension installation.")
        info("You can install it later with:")
        info(f"  pi install {ext_dir}")
        return

    info(f"Running: pi install {ext_dir}")
    try:
        run(["pi", "install", str(ext_dir)])
        info("Extension installed successfully.")
    except subprocess.CalledProcessError:
        warn("pi install failed. Trying manual symlink as fallback...")
        manual_symlink(ext_dir)


def manual_symlink(ext_dir: Path) -> None:
    """Fallback: symlink into ~/.pi/extensions/."""
    system = platform.system()
    home = Path.home()
    extensions_dir = home / ".pi" / "extensions"
    target = extensions_dir / "impression"

    if target.exists() or target.is_symlink():
        info(f"Link already exists at {target}")
        return

    extensions_dir.mkdir(parents=True, exist_ok=True)

    try:
        if system == "Windows":
            # Windows requires special handling for symlinks
            # Use directory junction as fallback (no admin needed)
            run(["cmd", "/c", "mklink", "/J", str(target), str(ext_dir)], check=True)
        else:
            target.symlink_to(ext_dir)
        info(f"Symlinked {target} -> {ext_dir}")
    except (subprocess.CalledProcessError, OSError) as e:
        error(f"Could not create symlink: {e}")
        info("Create it manually:")
        if system == "Windows":
            info(f'  mklink /J "{target}" "{ext_dir}"')
        else:
            info(f"  ln -s {ext_dir} {target}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    heading("Impression System — Setup")
    info("This script will help you set up pi and the Impression extension.")
    info(f"Platform: {platform.system()} {platform.machine()}")
    info(f"Python: {sys.version.split()[0]}")
    print()

    ensure_pi()
    configure_api_keys()
    install_extension()

    heading("Done!")
    info("Run `pi` to start a coding session with impression-powered context compression.")
    info("Configuration: create .pi/impression.json in your project root (optional).")
    info("Documentation: see README.md in this directory.")
    print()


if __name__ == "__main__":
    main()
