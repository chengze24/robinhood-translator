import os
from dotenv import load_dotenv
import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

SYSTEM_PROMPT = """你是一名专业的金融翻译，专门为不懂英语的中国散户投资者翻译美股相关内容。

翻译要求：
- 译文自然流畅，符合中文母语者的表达习惯
- 保留所有股票代码（如 NVDA、AAPL）、数字、日期和百分比，不做任何改动
- 对散户投资者可能不熟悉的金融术语，在其后用括号附上简短的中文解释（例如：EPS（每股盈利））
- 直接输出译文，不加任何开场白、说明或评论"""


class TranslateRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/translate")
def translate(req: TranslateRequest):
    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": req.text}],
        )
        return {"translation": message.content[0].text}
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=str(e))
