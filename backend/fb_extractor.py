"""
Facebook public-profile enrichment.

Fetches public OpenGraph metadata (name, profile picture, follower count)
from m.facebook.com — uses the same data that any messenger/social-card
preview would scrape. NEVER performs login or any authenticated request.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional, TypedDict

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("fb_extractor")

IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)

HEADERS = {
    "User-Agent": IPHONE_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
}


class ProfileInfo(TypedDict, total=False):
    name: Optional[str]
    username: Optional[str]
    user_id: Optional[str]
    profile_pic: Optional[str]
    follower_count: Optional[int]
    description: Optional[str]
    ok: bool
    error: Optional[str]


def _parse_html(html: str) -> ProfileInfo:
    soup = BeautifulSoup(html, "html.parser")

    out: ProfileInfo = {"ok": False}

    title_tag = soup.find("meta", property="og:title")
    if title_tag and title_tag.get("content"):
        out["name"] = title_tag["content"].strip()

    img_tag = soup.find("meta", property="og:image")
    if img_tag and img_tag.get("content"):
        out["profile_pic"] = img_tag["content"].strip()

    desc_tag = soup.find("meta", property="og:description")
    if desc_tag and desc_tag.get("content"):
        desc = desc_tag["content"].strip()
        out["description"] = desc
        m = re.search(r"([\d,]+)\s+(?:likes|followers)", desc, re.IGNORECASE)
        if m:
            try:
                out["follower_count"] = int(m.group(1).replace(",", ""))
            except ValueError:
                pass

    url_tag = soup.find("meta", property="og:url")
    if url_tag and url_tag.get("content"):
        url_match = re.search(r"facebook\.com/([^/?]+)", url_tag["content"])
        if url_match:
            out["username"] = url_match.group(1)

    android_tag = soup.find("meta", property="al:android:url")
    if android_tag and android_tag.get("content"):
        m = re.search(r"profile/(\d+)", android_tag["content"])
        if m:
            out["user_id"] = m.group(1)

    if out.get("name") or out.get("profile_pic"):
        out["ok"] = True
    return out


async def fetch_profile_by_uid(
    uid: str,
    client: Optional[httpx.AsyncClient] = None,
    timeout: float = 12.0,
) -> ProfileInfo:
    """Resolve a Facebook UID (digits) to a public profile dict.

    Uses m.facebook.com/profile.php?id=<uid>. Only public OG metadata is read.
    """
    if not uid or not uid.isdigit():
        return {"ok": False, "error": "uid must be numeric"}

    url = f"https://m.facebook.com/profile.php?id={uid}"
    own_client = client is None
    if client is None:
        client = httpx.AsyncClient(headers=HEADERS, timeout=timeout, follow_redirects=True)

    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return {"ok": False, "error": f"http {resp.status_code}"}
        info = _parse_html(resp.text)
        # If username could not be parsed but uid is known, fall back to uid
        if not info.get("username"):
            info["username"] = uid
        if not info.get("user_id"):
            info["user_id"] = uid
        return info
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"http_error: {type(e).__name__}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"err: {type(e).__name__}: {e}"}
    finally:
        if own_client:
            await client.aclose()


async def fetch_profile_by_username(
    username: str,
    client: Optional[httpx.AsyncClient] = None,
    timeout: float = 12.0,
) -> ProfileInfo:
    if not username:
        return {"ok": False, "error": "missing username"}
    url = f"https://m.facebook.com/{username}"
    own_client = client is None
    if client is None:
        client = httpx.AsyncClient(headers=HEADERS, timeout=timeout, follow_redirects=True)
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return {"ok": False, "error": f"http {resp.status_code}"}
        info = _parse_html(resp.text)
        if not info.get("username"):
            info["username"] = username
        return info
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"http_error: {type(e).__name__}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"err: {type(e).__name__}: {e}"}
    finally:
        if own_client:
            await client.aclose()


async def fetch_many(identifiers: list[tuple[str, str]], concurrency: int = 5) -> dict[str, ProfileInfo]:
    """Fetch many profiles concurrently.

    identifiers: list of (key, value, kind) tuples — actually pass [(id_str, value, "uid"|"username")].
    Returns mapping id_str -> ProfileInfo.
    """
    sem = asyncio.Semaphore(concurrency)
    results: dict[str, ProfileInfo] = {}
    async with httpx.AsyncClient(headers=HEADERS, timeout=15.0, follow_redirects=True) as client:
        async def _one(key: str, value: str, kind: str):
            async with sem:
                if kind == "uid":
                    info = await fetch_profile_by_uid(value, client=client)
                else:
                    info = await fetch_profile_by_username(value, client=client)
                results[key] = info

        await asyncio.gather(*[_one(k, v, kind) for (k, v, kind) in identifiers])
    return results
