# date: 2026-08-16
# dev: myf
"""LaTeX 编译端点：pdflatex + bibtex 编译为 PDF（Overleaf 风格写作工作区）。"""

import asyncio
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from loguru import logger

from app.core.security import verify_internal_token

router = APIRouter()


class LatexCompileRequest(BaseModel):
    tex: str = Field(..., min_length=10, description="LaTeX 源文件内容")
    bib: str = Field(default="", description="可选 BibTeX 内容（写为 references.bib）")


async def _run(cmd: list[str], cwd: str, timeout: float = 60) -> int:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await asyncio.wait_for(proc.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise HTTPException(status_code=504, detail="LaTeX compilation timed out")
    return proc.returncode or 0


@router.post(
    "/latex/compile",
    dependencies=[Depends(verify_internal_token)],
    responses={200: {"content": {"application/pdf": {}}}},
)
async def compile_latex(req: LatexCompileRequest):
    """用 pdflatex + bibtex 编译 LaTeX 源码，返回 PDF 二进制。"""
    if shutil.which("pdflatex") is None:
        raise HTTPException(status_code=500, detail="pdflatex not installed")

    tmpdir = tempfile.mkdtemp(prefix="latex_")
    try:
        tex_path = Path(tmpdir) / "main.tex"
        tex_path.write_text(req.tex, encoding="utf-8")

        has_bib = "\\bibliography" in req.tex and req.bib.strip()
        if has_bib:
            (Path(tmpdir) / "references.bib").write_text(req.bib, encoding="utf-8")

        # 第一遍 pdflatex（生成 .aux）
        if await _run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex"], tmpdir) != 0:
            raise HTTPException(status_code=400, detail="LaTeX compilation failed (pass 1)")

        # 有参考文献则跑 bibtex + 两遍 pdflatex 解析引用
        if has_bib:
            await _run(["bibtex", "main"], tmpdir)
            await _run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex"], tmpdir)
            await _run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex"], tmpdir)
        else:
            await _run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex"], tmpdir)

        pdf_path = Path(tmpdir) / "main.pdf"
        if not pdf_path.exists():
            raise HTTPException(status_code=400, detail="No PDF produced")

        pdf_bytes = pdf_path.read_bytes()
        logger.info(f"LaTeX 编译成功：{len(pdf_bytes)} bytes (bib={has_bib})")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'inline; filename="compiled.pdf"'},
        )
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
