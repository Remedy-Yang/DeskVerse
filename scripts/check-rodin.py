"""Read-only Rodin credential check; never creates a generation task."""
import json
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from rodin_service import API_BASE, NoRedirect, load_api_key


def main():
    root = Path(__file__).resolve().parent.parent
    key = load_api_key(root)
    if not key:
        raise SystemExit('No Rodin key configured.')
    request = Request(API_BASE + 'check_balance', headers={'Authorization': 'Bearer ' + key})
    try:
        with build_opener(NoRedirect).open(request, timeout=25) as response:
            data = json.loads(response.read(65536))
        if not isinstance(data.get('balance'), (int, float)):
            raise SystemExit('Rodin did not return a valid balance; check API subscription in the console.')
        print('Rodin API key accepted. Remaining credits:', data['balance'])
        print('Read-only check only. No photo uploaded and no generation submitted.')
    except HTTPError as error:
        raise SystemExit('Rodin rejected the read-only check (HTTP ' + str(error.code) + '). Verify API subscription/key in the console.')
    except (URLError, TimeoutError, OSError, ValueError):
        raise SystemExit('Rodin check failed: network/TLS response unavailable. No generation submitted.')


if __name__ == '__main__':
    main()
