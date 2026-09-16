from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

import database
import security
from dependencies import SESSION_COOKIE_NAME, get_current_user_id
from middleware import auth_logger
from models.user import UserRegistration, UserLogin
from queries import users as user_queries
from queries import sessions as session_queries

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register_user(registration: UserRegistration):
    existing_user = database.execute_sql_query(
        user_queries.GET_USER_BY_EMAIL, (registration.email,), fetch="one"
    )
    if existing_user is not None:
        auth_logger.warning("registration rejected, email already exists")
        raise HTTPException(status_code=400, detail="Registration failed")

    password_hash = security.hash_password(registration.password)
    created_user = database.execute_sql_query(
        user_queries.INSERT_USER,
        (registration.email, password_hash),
        fetch="one",
    )
    auth_logger.info("user registered: %s", created_user["id"])
    return created_user


@router.post("/login")
def login_user(credentials: UserLogin, response: Response):
    user = database.execute_sql_query(
        user_queries.GET_USER_BY_EMAIL, (credentials.email,), fetch="one"
    )

    if user is None or not security.verify_password(
        user["password_hash"], credentials.password
    ):
        auth_logger.warning("login failed")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Sessions never get deleted on their own once they expire — sweep them
    # out here rather than letting the table grow forever.
    database.execute_sql_query(session_queries.DELETE_EXPIRED_SESSIONS)

    session_token = security.generate_session_token()
    database.execute_sql_query(
        session_queries.INSERT_SESSION,
        (user["id"], session_token),
        fetch="one",
    )

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        secure=False,  # phase 3: must become True once TLS exists
        samesite="lax",
        max_age=7200,
    )
    auth_logger.info("login succeeded: %s", user["id"])
    return {"message": "Logged in"}


@router.get("/me")
def read_current_user(current_user_id=Depends(get_current_user_id)):
    return database.execute_sql_query(
        user_queries.GET_USER_BY_ID, (current_user_id,), fetch="one"
    )


@router.post("/logout")
def logout_user(response: Response, cloudshield_session: str = Cookie(default=None)):
    if cloudshield_session is not None:
        database.execute_sql_query(
            session_queries.DELETE_SESSION, (cloudshield_session,)
        )
        auth_logger.info("logout")
    response.delete_cookie(SESSION_COOKIE_NAME)
    return {"message": "Logged out"}
