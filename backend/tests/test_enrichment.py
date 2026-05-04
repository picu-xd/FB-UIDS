"""Tests for FB profile enrichment (iteration 2 features)."""
import os
import time
import uuid
import requests
import pytest
from dotenv import dotenv_values

cfg = dotenv_values("/app/frontend/.env")
BASE_URL = cfg["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def user_headers():
    email = f"enrich_{uuid.uuid4().hex[:8]}@test.com"
    pw = "testpass123"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": pw, "name": "Enrich User"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestEnrichment:
    def test_bulk_save_triggers_background_enrichment_for_uid_4(self, user_headers):
        # UID 4 = Mark Zuckerberg, public profile.
        r = requests.post(
            f"{API}/accounts/bulk",
            headers=user_headers,
            json={"accounts": [{"identifier": "4", "password": "dummy", "type": "uid"}]},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Note: server requires 8+ digit UIDs in regex but bulk endpoint accepts anything;
        # type was forced to uid. Even if extractor rejects it, we should still get inserted=1.
        assert data["inserted"] == 1
        acc_id = data["accounts"][0]["id"]

        # Wait for the background task to finish
        enriched = None
        for _ in range(15):  # up to ~30s
            time.sleep(2)
            lr = requests.get(f"{API}/accounts", headers=user_headers, timeout=20)
            assert lr.status_code == 200
            for a in lr.json()["accounts"]:
                if a["id"] == acc_id:
                    if a.get("enriched_at") or a.get("profile_name") or a.get("profile_pic"):
                        enriched = a
                        break
            if enriched:
                break

        assert enriched is not None, "UID 4 was not enriched within 30s"
        assert enriched["profile_name"], f"missing profile_name: {enriched}"
        # Mark Zuckerberg name check (loose - FB sometimes returns 'Facebook')
        assert "zuck" in (enriched.get("profile_username") or "").lower() or enriched["profile_user_id"] == "4"
        assert enriched["profile_pic"] and enriched["profile_pic"].startswith("http")
        assert enriched["enriched_at"] is not None
        # follower count optional - public profiles often have it
        if enriched.get("follower_count") is not None:
            assert enriched["follower_count"] > 0

    def test_enrich_endpoint_all(self, user_headers):
        # Save another known public UID and call /enrich
        requests.post(
            f"{API}/accounts/bulk",
            headers=user_headers,
            json={"accounts": [{"identifier": "100044839487374", "password": "x", "type": "uid"}]},
            timeout=30,
        )
        r = requests.post(f"{API}/accounts/enrich", headers=user_headers, json={}, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "enriched" in data
        assert "total" in data
        assert "accounts" in data
        assert data["total"] >= 1
        # At least one of the accounts should have profile data populated
        # (UID 4 we already saved; even if private one fails, UID 4 succeeds)
        any_enriched = any(
            a.get("profile_name") or a.get("profile_pic") for a in data["accounts"]
        )
        assert any_enriched, f"no account got enriched: {data['accounts']}"

    def test_enrich_endpoint_specific_id(self, user_headers):
        # Get current account list
        lr = requests.get(f"{API}/accounts", headers=user_headers, timeout=20)
        accs = lr.json()["accounts"]
        assert accs, "expected at least one account"
        target = next((a for a in accs if a["identifier"] == "4"), accs[0])
        r = requests.post(
            f"{API}/accounts/enrich",
            headers=user_headers,
            json={"account_ids": [target["id"]]},
            timeout=60,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert len(data["accounts"]) == 1

    def test_enrich_handles_invalid_uid_gracefully(self, user_headers):
        # Bogus UID that won't resolve to a profile
        bogus = "99999999999999999"
        rb = requests.post(
            f"{API}/accounts/bulk",
            headers=user_headers,
            json={"accounts": [{"identifier": bogus, "password": "p", "type": "uid"}]},
            timeout=30,
        )
        assert rb.status_code == 200
        bogus_id = rb.json()["accounts"][0]["id"]

        r = requests.post(
            f"{API}/accounts/enrich",
            headers=user_headers,
            json={"account_ids": [bogus_id]},
            timeout=60,
        )
        # Should NOT 500 — gracefully report
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        # bogus account should still exist; profile fields may or may not be populated
        # (FB often returns a generic placeholder page — that's acceptable; test only that
        # request did not error)
