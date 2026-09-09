import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import text
from sqlmodel import Session, col, func, select

from app.database import get_session
from app.models import Produto
from app.schemas import (
    BaixaEstoqueIn,
    BaixaEstoqueOut,
    EstoqueOut,
    Paginacao,
    ProdutoCreate,
    ProdutoListOut,
    ProdutoOut,
    ProdutoUpdate,
    ReposicaoEstoqueIn,
    ReposicaoEstoqueOut,
)

router = APIRouter(prefix="/produtos", tags=["produtos"])

PRODUTO_NAO_ENCONTRADO = "Produto não encontrado"


def _buscar_produto(session: Session, produto_id: int) -> Produto:
    produto = session.get(Produto, produto_id)
    if produto is None:
        raise HTTPException(status_code=404, detail=PRODUTO_NAO_ENCONTRADO)
    return produto


@router.post("", response_model=ProdutoOut, status_code=status.HTTP_201_CREATED)
def criar_produto(dados: ProdutoCreate, session: Session = Depends(get_session)):
    produto = Produto(**dados.model_dump())
    session.add(produto)
    session.commit()
    session.refresh(produto)
    return produto


@router.get("", response_model=ProdutoListOut)
def listar_produtos(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    nome: Optional[str] = Query(None, description="busca parcial (LIKE)"),
    categoria: Optional[str] = Query(None, description="match exato"),
    session: Session = Depends(get_session),
):
    filtros = []
    if nome:
        filtros.append(col(Produto.nome).ilike(f"%{nome}%"))
    if categoria:
        filtros.append(Produto.categoria == categoria)

    total_itens = session.exec(
        select(func.count()).select_from(Produto).where(*filtros)
    ).one()

    produtos = session.exec(
        select(Produto)
        .where(*filtros)
        .order_by(col(Produto.id))
        .offset((page - 1) * limit)
        .limit(limit)
    ).all()

    return ProdutoListOut(
        data=[ProdutoOut.model_validate(p) for p in produtos],
        pagination=Paginacao(
            page=page,
            limit=limit,
            total_itens=total_itens,
            total_paginas=math.ceil(total_itens / limit) if total_itens else 0,
        ),
    )


@router.get("/{produto_id}", response_model=ProdutoOut)
def buscar_produto(produto_id: int, session: Session = Depends(get_session)):
    return _buscar_produto(session, produto_id)


@router.put("/{produto_id}", response_model=ProdutoOut)
def atualizar_produto(
    produto_id: int,
    dados: ProdutoUpdate,
    session: Session = Depends(get_session),
):
    campos = dados.model_dump(exclude_unset=True)
    if not campos:
        raise HTTPException(
            status_code=400,
            detail="Informe ao menos um campo para atualizar",
        )

    produto = _buscar_produto(session, produto_id)
    for campo, valor in campos.items():
        setattr(produto, campo, valor)

    session.add(produto)
    session.commit()
    session.refresh(produto)
    return produto


@router.delete("/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_produto(produto_id: int, session: Session = Depends(get_session)):
    produto = _buscar_produto(session, produto_id)
    session.delete(produto)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------
# Endpoints de estoque -- contrato de integração com a API de Pedidos
# --------------------------------------------------------------------------


@router.get("/{produto_id}/estoque", response_model=EstoqueOut)
def consultar_estoque(produto_id: int, session: Session = Depends(get_session)):
    produto = _buscar_produto(session, produto_id)
    return EstoqueOut(
        produto_id=produto.id,
        quantidade_disponivel=produto.quantidade_estoque,
    )


@router.post("/{produto_id}/estoque/baixa", response_model=BaixaEstoqueOut)
def baixar_estoque(
    produto_id: int,
    dados: BaixaEstoqueIn,
    session: Session = Depends(get_session),
):
    """Checa e decrementa na MESMA transação, evitando condição de corrida.

    O UPDATE condicional (`WHERE quantidade_estoque >= :quantidade`) faz a
    verificação e a escrita em uma única operação atômica do banco: duas
    requisições simultâneas nunca conseguem baixar o mesmo item duas vezes.
    """
    resultado = session.execute(
        text(
            "UPDATE produtos "
            "SET quantidade_estoque = quantidade_estoque - :quantidade "
            "WHERE id = :produto_id AND quantidade_estoque >= :quantidade"
        ).bindparams(quantidade=dados.quantidade, produto_id=produto_id)
    )

    if resultado.rowcount == 1:
        session.commit()
        produto = session.get(Produto, produto_id)
        return BaixaEstoqueOut(
            produto_id=produto_id,
            quantidade_anterior=produto.quantidade_estoque + dados.quantidade,
            quantidade_atual=produto.quantidade_estoque,
        )

    # Nada foi atualizado: ou o produto não existe, ou o estoque é insuficiente.
    produto = session.get(Produto, produto_id)
    disponivel = produto.quantidade_estoque if produto else None
    session.rollback()

    if disponivel is None:
        raise HTTPException(status_code=404, detail=PRODUTO_NAO_ENCONTRADO)

    raise HTTPException(
        status_code=409,
        detail={
            "erro": "Estoque insuficiente",
            "quantidade_disponivel": disponivel,
            "quantidade_solicitada": dados.quantidade,
        },
    )


@router.post("/{produto_id}/estoque/reposicao", response_model=ReposicaoEstoqueOut)
def repor_estoque(
    produto_id: int,
    dados: ReposicaoEstoqueIn,
    session: Session = Depends(get_session),
):
    """Devolve quantidade ao estoque (estorno de pedido cancelado).

    Operação inversa da baixa. Também é feita em um único UPDATE atômico, para
    que devoluções simultâneas não se sobrescrevam. Não existe caso de 409:
    repor nunca deixa o estoque inválido.
    """
    resultado = session.execute(
        text(
            "UPDATE produtos "
            "SET quantidade_estoque = quantidade_estoque + :quantidade "
            "WHERE id = :produto_id"
        ).bindparams(quantidade=dados.quantidade, produto_id=produto_id)
    )

    if resultado.rowcount == 0:
        session.rollback()
        raise HTTPException(status_code=404, detail=PRODUTO_NAO_ENCONTRADO)

    session.commit()
    produto = session.get(Produto, produto_id)
    return ReposicaoEstoqueOut(
        produto_id=produto_id,
        quantidade_anterior=produto.quantidade_estoque - dados.quantidade,
        quantidade_atual=produto.quantidade_estoque,
    )
