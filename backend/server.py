from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import logging
import secrets
import random
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from contextlib import asynccontextmanager

from fb_extractor import fetch_many, fetch_profile_by_uid, fetch_profile_by_username


# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days for mobile

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fbchecker.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("fb_checker")


# ------------------------------------------------------------------
# DB
# ------------------------------------------------------------------
client = AsyncIOMotorClient(MONGO_URL, tz_aware=True)
db = client[DB_NAME]
bearer_scheme = HTTPBearer(auto_error=False)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def serialize_user(user_doc: dict) -> dict:
    return {
        "id": str(user_doc["_id"]),
        "email": user_doc["email"],
        "name": user_doc.get("name", ""),
        "role": user_doc.get("role", "user"),
        "created_at": user_doc.get("created_at").isoformat() if user_doc.get("created_at") else None,
    }


def serialize_account(acc: dict) -> dict:
    return {
        "id": str(acc["_id"]),
        "identifier": acc["identifier"],
        "password": acc["password"],
        "type": acc.get("type", "uid"),
        "status": acc.get("status", "pending"),
        "note": acc.get("note", ""),
        "created_at": acc.get("created_at").isoformat() if acc.get("created_at") else None,
        "checked_at": acc.get("checked_at").isoformat() if acc.get("checked_at") else None,
        "profile_name": acc.get("profile_name"),
        "profile_username": acc.get("profile_username"),
        "profile_pic": acc.get("profile_pic"),
        "profile_user_id": acc.get("profile_user_id"),
        "follower_count": acc.get("follower_count"),
        "enriched_at": acc.get("enriched_at").isoformat() if acc.get("enriched_at") else None,
    }


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    request: Request = None,
) -> dict:
    token = None
    if creds and creds.scheme.lower() == "bearer":
        token = creds.credentials
    if not token and request is not None:
        # also accept ?token=... as last resort (not used by app)
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ------------------------------------------------------------------
# Brute-force protection
# ------------------------------------------------------------------
MAX_FAILED = 5
LOCKOUT_MIN = 15


async def check_brute_force(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec:
        return
    locked_until = rec.get("locked_until")
    if locked_until and locked_until > datetime.now(timezone.utc):
        remaining = int((locked_until - datetime.now(timezone.utc)).total_seconds() / 60) + 1
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {remaining} min.")


async def record_failed_attempt(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    count = (rec.get("count", 0) if rec else 0) + 1
    update = {"identifier": identifier, "count": count, "last_attempt": datetime.now(timezone.utc)}
    if count >= MAX_FAILED:
        update["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MIN)
        update["count"] = 0
    await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)


async def clear_attempts(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


# ------------------------------------------------------------------
# Pydantic models
# ------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class AccountIn(BaseModel):
    identifier: str
    password: str
    type: Literal["uid", "email"] = "uid"


class BulkAccountsIn(BaseModel):
    accounts: List[AccountIn]


class CheckIn(BaseModel):
    account_ids: List[str]


class BulkDeleteIn(BaseModel):
    account_ids: List[str]


class EnrichIn(BaseModel):
    account_ids: Optional[List[str]] = None  # if None — enrich all UID-type pending


class ParseIn(BaseModel):
    text: str


# ------------------------------------------------------------------
# Enrichment helpers
# ------------------------------------------------------------------
async def enrich_accounts(user_id: str, account_ids: List[ObjectId]) -> int:
    """Fetch FB profile data for each account that is uid-type and not yet enriched.

    Returns number of accounts that received profile info.
    """
    if not account_ids:
        return 0
    cursor = db.accounts.find({"_id": {"$in": account_ids}, "user_id": user_id})
    targets: list[tuple[str, str, str]] = []
    docs_by_key: dict[str, dict] = {}
    async for doc in cursor:
        key = str(doc["_id"])
        docs_by_key[key] = doc
        if doc.get("type") == "uid" and doc.get("identifier", "").isdigit():
            targets.append((key, doc["identifier"], "uid"))

    if not targets:
        return 0

    try:
        results = await fetch_many(targets, concurrency=5)
    except Exception as e:  # noqa: BLE001
        logger.warning("Enrichment batch failed: %s", e)
        return 0

    updated = 0
    now = datetime.now(timezone.utc)
    for key, info in results.items():
        if not info.get("ok"):
            continue
        update: dict = {"enriched_at": now}
        if info.get("name"):
            update["profile_name"] = info["name"]
        if info.get("profile_pic"):
            update["profile_pic"] = info["profile_pic"]
        if info.get("username"):
            update["profile_username"] = info["username"]
        if info.get("user_id"):
            update["profile_user_id"] = info["user_id"]
        if info.get("follower_count") is not None:
            update["follower_count"] = info["follower_count"]
        try:
            await db.accounts.update_one({"_id": ObjectId(key)}, {"$set": update})
            updated += 1
        except Exception:  # noqa: BLE001
            pass
    logger.info("Enriched %d/%d accounts", updated, len(targets))
    return updated


# ------------------------------------------------------------------
# Smart Parser
# ------------------------------------------------------------------
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
UID_RE = re.compile(r"\b\d{8,20}\b")  # facebook UIDs are typically 10-17 digits


def _classify_identifier(identifier: str) -> Optional[str]:
    if EMAIL_RE.fullmatch(identifier):
        return "email"
    if UID_RE.fullmatch(identifier):
        return "uid"
    return None


def parse_text(text: str) -> List[dict]:
    """Extract identifier:password pairs from messy text."""
    results: List[dict] = []
    seen: set = set()

    # Each "record" is on its own line OR separated by ;
    # Inside a record, identifier and password are separated by : | , tab or whitespace
    raw_records = re.split(r"[\r\n;]+", text)
    pair_re = re.compile(r"^([A-Za-z0-9._%+\-@]+)[\s:|,\t]+(\S.*?)$")

    for record in raw_records:
        record = record.strip()
        if not record:
            continue
        m = pair_re.match(record)
        if not m:
            continue
        identifier = m.group(1).strip()
        password = m.group(2).strip().rstrip(",.;|")
        # password must not contain whitespace (mostly) — take first token if multiple
        password = password.split()[0] if password else password
        if not identifier or not password:
            continue
        acc_type = _classify_identifier(identifier)
        if acc_type is None:
            continue
        key = f"{identifier.lower()}:{password}"
        if key in seen:
            continue
        seen.add(key)
        results.append({"identifier": identifier, "password": password, "type": acc_type})
    return results


# ------------------------------------------------------------------
# Routers
# ------------------------------------------------------------------
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "FB Checker API", "version": "1.0.0"}


# ---------- Auth ----------
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register", response_model=AuthOut)
async def register(payload: RegisterIn):
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name.strip(),
        "role": "user",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(doc)
    user_doc = await db.users.find_one({"_id": result.inserted_id})
    token = create_access_token(str(user_doc["_id"]), user_doc["email"])
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(user_doc)}


@auth_router.post("/login", response_model=AuthOut)
async def login(payload: LoginIn, request: Request):
    email = payload.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    await check_brute_force(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failed_attempt(identifier)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    await clear_attempts(identifier)
    token = create_access_token(str(user["_id"]), user["email"])
    return {"access_token": token, "token_type": "bearer", "user": serialize_user(user)}


@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


@auth_router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    # stateless JWT — client just discards token
    return {"ok": True}


api.include_router(auth_router)


# ---------- Accounts ----------
acc_router = APIRouter(prefix="/accounts", tags=["accounts"])


@acc_router.post("/parse")
async def parse_endpoint(payload: ParseIn, user: dict = Depends(get_current_user)):
    parsed = parse_text(payload.text)
    return {"count": len(parsed), "accounts": parsed}


@acc_router.post("/bulk")
async def bulk_save(
    payload: BulkAccountsIn,
    background: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    if not payload.accounts:
        return {"inserted": 0, "duplicates": 0, "accounts": []}
    user_id = str(user["_id"])
    # Pull existing keys to dedupe per-user
    existing = await db.accounts.find(
        {"user_id": user_id},
        {"identifier": 1, "password": 1, "_id": 0},
    ).to_list(length=None)
    existing_keys = {f"{a['identifier'].lower()}:{a['password']}" for a in existing}

    to_insert = []
    seen_in_payload = set()
    for a in payload.accounts:
        key = f"{a.identifier.lower()}:{a.password}"
        if key in existing_keys or key in seen_in_payload:
            continue
        seen_in_payload.add(key)
        to_insert.append({
            "user_id": user_id,
            "identifier": a.identifier,
            "password": a.password,
            "type": a.type,
            "status": "pending",
            "note": "",
            "created_at": datetime.now(timezone.utc),
            "checked_at": None,
            "profile_name": None,
            "profile_username": None,
            "profile_pic": None,
            "profile_user_id": None,
            "follower_count": None,
            "enriched_at": None,
        })

    inserted_accounts: List[dict] = []
    inserted_oids: list = []
    if to_insert:
        result = await db.accounts.insert_many(to_insert)
        inserted_oids = list(result.inserted_ids)
        cursor = db.accounts.find({"_id": {"$in": inserted_oids}})
        async for doc in cursor:
            inserted_accounts.append(serialize_account(doc))

        # Kick off background enrichment for newly-saved UID accounts
        background.add_task(enrich_accounts, user_id, inserted_oids)

    duplicates = len(payload.accounts) - len(to_insert)
    return {
        "inserted": len(to_insert),
        "duplicates": duplicates,
        "accounts": inserted_accounts,
    }


@acc_router.get("")
async def list_accounts(
    status: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    q: dict = {"user_id": str(user["_id"])}
    if status and status != "all":
        q["status"] = status
    cursor = db.accounts.find(q).sort("created_at", -1)
    items = []
    async for doc in cursor:
        items.append(serialize_account(doc))
    return {"count": len(items), "accounts": items}


@acc_router.delete("/{account_id}")
async def delete_account(account_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(account_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    res = await db.accounts.delete_one({"_id": oid, "user_id": str(user["_id"])})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": 1}


@acc_router.post("/bulk-delete")
async def bulk_delete(payload: BulkDeleteIn, user: dict = Depends(get_current_user)):
    oids = []
    for s in payload.account_ids:
        try:
            oids.append(ObjectId(s))
        except Exception:
            continue
    if not oids:
        return {"deleted": 0}
    res = await db.accounts.delete_many({"_id": {"$in": oids}, "user_id": str(user["_id"])})
    return {"deleted": res.deleted_count}


@acc_router.post("/check")
async def mock_check(payload: CheckIn, user: dict = Depends(get_current_user)):
    """Mock validation — randomly assigns valid/invalid based on heuristics."""
    if not payload.account_ids:
        return {"checked": 0, "valid": 0, "invalid": 0, "accounts": []}
    oids = []
    for s in payload.account_ids:
        try:
            oids.append(ObjectId(s))
        except Exception:
            continue
    if not oids:
        return {"checked": 0, "valid": 0, "invalid": 0, "accounts": []}

    cursor = db.accounts.find({"_id": {"$in": oids}, "user_id": str(user["_id"])})
    valid_count = 0
    invalid_count = 0
    out = []
    async for doc in cursor:
        # Heuristic mock: longer + mixed-case password = more likely valid
        pwd = doc["password"]
        score = 0
        if len(pwd) >= 8:
            score += 1
        if any(c.isupper() for c in pwd) and any(c.islower() for c in pwd):
            score += 1
        if any(c.isdigit() for c in pwd):
            score += 1
        if any(c in "!@#$%^&*()_+-=" for c in pwd):
            score += 1
        # base probability 0.45, +0.10 per score point
        prob = min(0.85, 0.45 + 0.10 * score)
        is_valid = random.random() < prob
        new_status = "valid" if is_valid else "invalid"
        await db.accounts.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": new_status, "checked_at": datetime.now(timezone.utc)}},
        )
        if is_valid:
            valid_count += 1
        else:
            invalid_count += 1
        doc["status"] = new_status
        doc["checked_at"] = datetime.now(timezone.utc)
        out.append(serialize_account(doc))

        # also log activity
        await db.activity_log.insert_one({
            "user_id": str(user["_id"]),
            "type": "check",
            "account_id": str(doc["_id"]),
            "result": new_status,
            "ts": datetime.now(timezone.utc),
        })

    return {
        "checked": valid_count + invalid_count,
        "valid": valid_count,
        "invalid": invalid_count,
        "accounts": out,
    }


@acc_router.post("/enrich")
async def enrich_endpoint(
    payload: EnrichIn,
    user: dict = Depends(get_current_user),
):
    """Re-fetch FB profile data for given accounts (or all UID accounts not yet enriched)."""
    user_id = str(user["_id"])
    if payload.account_ids:
        oids = []
        for s in payload.account_ids:
            try:
                oids.append(ObjectId(s))
            except Exception:
                continue
    else:
        cursor = db.accounts.find(
            {"user_id": user_id, "type": "uid"},
            {"_id": 1},
        )
        oids = [doc["_id"] async for doc in cursor]

    enriched = await enrich_accounts(user_id, oids)

    # Return the (now-updated) accounts back to the caller
    cursor = db.accounts.find({"_id": {"$in": oids}, "user_id": user_id})
    out = []
    async for doc in cursor:
        out.append(serialize_account(doc))
    return {"enriched": enriched, "total": len(oids), "accounts": out}


api.include_router(acc_router)


# ---------- Stats ----------
@api.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    user_id = str(user["_id"])
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    counts = {"pending": 0, "valid": 0, "invalid": 0, "checking": 0}
    async for doc in db.accounts.aggregate(pipeline):
        counts[doc["_id"]] = doc["count"]
    total = sum(counts.values())

    type_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
    ]
    type_counts = {"uid": 0, "email": 0}
    async for doc in db.accounts.aggregate(type_pipeline):
        if doc["_id"] in type_counts:
            type_counts[doc["_id"]] = doc["count"]

    # recent activity
    recent_cursor = db.activity_log.find({"user_id": user_id}).sort("ts", -1).limit(20)
    recent = []
    async for log in recent_cursor:
        recent.append({
            "type": log.get("type", ""),
            "result": log.get("result", ""),
            "ts": log["ts"].isoformat() if log.get("ts") else None,
        })

    return {
        "total": total,
        "by_status": counts,
        "by_type": type_counts,
        "recent_activity": recent,
    }


# ---------- Lifespan / startup ----------
async def seed_admin():
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if existing is None:
        await db.users.insert_one({
            "email": ADMIN_EMAIL.lower(),
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc),
        })
        logger.info("Seeded admin user %s", ADMIN_EMAIL)
    else:
        if not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
            await db.users.update_one(
                {"email": ADMIN_EMAIL.lower()},
                {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}},
            )
            logger.info("Updated admin password")


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.accounts.create_index([("user_id", 1), ("created_at", -1)])
    await db.accounts.create_index([("user_id", 1), ("status", 1)])
    await db.login_attempts.create_index("identifier", unique=True)
    await db.activity_log.create_index([("user_id", 1), ("ts", -1)])


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    await seed_admin()
    logger.info("FB Checker API ready")
    yield
    client.close()


# ------------------------------------------------------------------
# App
# ------------------------------------------------------------------
app = FastAPI(title="FB Checker API", lifespan=lifespan)
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # mobile uses Bearer; no cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
