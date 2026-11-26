from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import CurrentUser
from app.schemas.analytics import DashboardOut, MyWorkOut
from app.services.analytics import get_dashboard, get_my_work

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(_: CurrentUser, db: Session = Depends(get_db)):
    return get_dashboard(db)


@router.get("/my-work", response_model=MyWorkOut)
def my_work(user: CurrentUser, db: Session = Depends(get_db)):
    return get_my_work(db, user)
