"""Configure a local credential without echoing it or passing it as a shell argument."""
from getpass import getpass
import os
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent.parent
    key = getpass('Rodin API Key (hidden): ').strip()
    if not key or any(character.isspace() for character in key):
        raise SystemExit('Invalid key; configuration unchanged.')
    path = root / '.env'
    lines = path.read_text(encoding='utf-8').splitlines() if path.exists() else []
    lines = [line for line in lines if line.partition('=')[0].strip() != 'RODIN_API_KEY']
    lines.append('RODIN_API_KEY=' + key)
    temporary = root / '.env.new'
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.chmod(temporary, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines) + '\n')
    temporary.replace(path)
    print('Saved to ignored local .env (permissions 600). Restart start.py to apply.')


if __name__ == '__main__':
    main()
