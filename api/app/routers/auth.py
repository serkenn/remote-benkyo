import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import AppConfig
from ..schemas import AuthStatusResponse, AuthTokenRequest, AuthTokenResponse, OkResponse
from ..services.claude import claude_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status(db: AsyncSession = Depends(get_db)) -> AuthStatusResponse:
    token = await claude_service.get_token(db)
    return AuthStatusResponse(authenticated=token is not None)


@router.post("/token", response_model=AuthTokenResponse)
async def set_auth_token(
    body: AuthTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthTokenResponse:
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token cannot be empty")

    # Validate the token by making a real API call
    valid = await claude_service.validate_token(token)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid Anthropic API token")

    # Store the token
    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "anthropic_api_key")
    )
    config = result.scalar_one_or_none()

    if config:
        config.value = token
    else:
        config = AppConfig(key="anthropic_api_key", value=token)
        db.add(config)

    await db.commit()
    return AuthTokenResponse(ok=True)


@router.delete("/token", response_model=OkResponse)
async def delete_auth_token(db: AsyncSession = Depends(get_db)) -> OkResponse:
    result = await db.execute(
        select(AppConfig).where(AppConfig.key == "anthropic_api_key")
    )
    config = result.scalar_one_or_none()

    if config:
        await db.delete(config)
        await db.commit()

    return OkResponse(ok=True)
