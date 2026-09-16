INSERT_SESSION = """
    INSERT INTO cloudshield.sessions (user_id, token, expires_at)
    VALUES (%s, %s, now() + interval '2 hours')
    RETURNING token, expires_at;
"""

GET_ACTIVE_SESSION = """
    SELECT user_id
    FROM cloudshield.sessions
    WHERE token = %s AND expires_at > now();
"""

DELETE_SESSION = """
    DELETE FROM cloudshield.sessions
    WHERE token = %s;
"""

DELETE_EXPIRED_SESSIONS = """
    DELETE FROM cloudshield.sessions
    WHERE expires_at < now();
"""
