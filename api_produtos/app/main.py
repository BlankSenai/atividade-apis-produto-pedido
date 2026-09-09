import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.database import criar_tabelas
from app.routers import produtos


@asynccontextmanager
async def lifespan(app: FastAPI):
    criar_tabelas()
    yield


app = FastAPI(
    title="API de Produtos",
    description=(
        "Cadastro de produtos e controle de estoque. "
        "Consumida pela API de Pedidos (Node/Express)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(produtos.router)


# --------------------------------------------------------------------------
# Padrão de erro: { "erro": "mensagem descritiva" }
# --------------------------------------------------------------------------


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Erros como o 409 de estoque insuficiente já vêm com o corpo pronto.
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"erro": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Traduz o 422 padrão do FastAPI para o 400 combinado no contrato."""
    problemas = []
    for erro in exc.errors():
        campo = ".".join(str(parte) for parte in erro["loc"] if parte != "body")
        problemas.append(f"{campo}: {erro['msg']}" if campo else erro["msg"])

    return JSONResponse(
        status_code=400,
        content={"erro": "Dados inválidos - " + "; ".join(problemas)},
    )


@app.exception_handler(Exception)
async def erro_interno_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"erro": "Erro interno do servidor"},
    )


@app.get("/", tags=["health"])
def health_check():
    return {"status": "ok", "servico": "api-produtos"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
