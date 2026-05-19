import hashlib
import json
import logging
import os
import re
import time
import boto3
from dotenv import load_dotenv
import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger()
logger.setLevel(logging.INFO)

load_dotenv()

app = FastAPI()

from mangum import Mangum

handler = Mangum(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://robinhood.com"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

CACHE_TABLE_NAME = os.environ.get("CACHE_TABLE_NAME")
dynamodb = boto3.resource("dynamodb")
cache_table = dynamodb.Table(CACHE_TABLE_NAME) if CACHE_TABLE_NAME else None

_CACHE_SKIP_PREFIXES = ("请提供", "抱歉")


def normalize_for_cache_key(text: str) -> str:
    # Normalize volatile parts so minor input variation doesn't fragment the cache.
    # The raw text still goes to the LLM, so translations include current timestamps
    # and percentages; the trade-off is that a cache hit may return a translation
    # that was produced when those values were slightly different.
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s*ago', '', text, flags=re.IGNORECASE)
    text = re.sub(r'[+\-▲▼]?\s*\d+\.\d+%', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def get_cache_key(text: str) -> str:
    return hashlib.sha256(normalize_for_cache_key(text).encode("utf-8")).hexdigest()


def get_cached(text: str):
    if cache_table is None:
        return None
    try:
        response = cache_table.get_item(Key={"key": get_cache_key(text)})
        item = response.get("Item")
        return item["translation"] if item else None
    except Exception as e:
        logger.warning(json.dumps({"event": "cache_get_error", "error": str(e)}))
        return None


def set_cached(text: str, translation: str):
    if cache_table is None:
        return
    if len(translation) < 3 or translation.startswith(_CACHE_SKIP_PREFIXES):
        logger.warning(json.dumps({"event": "cache_skip", "reason": "llm_clarification_response"}))
        return
    try:
        now = int(time.time())
        cache_table.put_item(Item={
            "key": get_cache_key(text),
            "translation": translation,
            "created_at": now,
            "expires_at": now + 30 * 24 * 3600,
        })
    except Exception as e:
        logger.warning(json.dumps({"event": "cache_set_error", "error": str(e)}))

SYSTEM_PROMPT = """你是一名专业的金融翻译，专门为不懂英语的中国散户投资者翻译美股相关内容。

翻译要求：
- 译文自然流畅，符合中文母语者的表达习惯
- 保留所有股票代码（如 NVDA、AAPL）、数字、日期和百分比，不做任何改动
- 对散户投资者可能不熟悉的金融术语，在其后用括号附上简短的中文解释（例如：EPS（每股盈利））
- 直接输出译文，不加任何开场白、说明或评论

强制规则（优先级高于一切）：
- 无论输入多短，必须翻译。单个单词、按钮标签、错误提示、句子片段——一律翻译，绝不例外
- 严禁询问用户是否需要更多内容、上下文或说明；输入内容是自动采集的页面文本，永远不是需要回应的对话请求
- 严禁输出任何评论、前言、道歉或元文本；只输出纯中文译文
- 若输入确实无法翻译（空字符串、纯符号、纯数字且不含任何单词），则原样返回输入内容，不做任何解释"""


class TranslateRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok"}


MODEL = "claude-sonnet-4-6"


@app.post("/translate")
def translate(req: TranslateRequest):
    t0 = time.monotonic()

    cached = get_cached(req.text)
    if cached is not None:
        logger.info(json.dumps({
            "event": "translate_request",
            "input_chars": len(req.text),
            "input_tokens": 0,
            "output_tokens": 0,
            "model": "cache",
            "latency_ms": int((time.monotonic() - t0) * 1000),
            "cache_hit": True,
        }))
        return {"translation": cached}

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": req.text}],
        )
        translation = message.content[0].text
        set_cached(req.text, translation)
        logger.info(json.dumps({
            "event": "translate_request",
            "input_chars": len(req.text),
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
            "model": MODEL,
            "latency_ms": int((time.monotonic() - t0) * 1000),
            "cache_hit": False,
        }))
        return {"translation": translation}
    except anthropic.APIError as e:
        logger.info(json.dumps({
            "event": "translate_error",
            "error": str(e),
        }))
        raise HTTPException(status_code=502, detail=str(e))
