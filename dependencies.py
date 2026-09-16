from fastapi import Cookie, HTTPException

import database
from queries import sessions as session_queries

SESSION_COOKIE_NAME = "cloudshield_session"


def get_current_user_id(cloudshield_session: str = Cookie(default=None)):
    if cloudshield_session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = database.execute_sql_query(
        session_queries.GET_ACTIVE_SESSION,
        (cloudshield_session,),
        fetch="one",
    )

    if session is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return session["user_id"]
