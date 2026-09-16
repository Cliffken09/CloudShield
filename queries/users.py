INSERT_USER = """
    INSERT INTO cloudshield.users (email, password_hash)
    VALUES (%s, %s)
    RETURNING id, email, created_at;
"""

GET_USER_BY_EMAIL = """
    SELECT id, email, password_hash
    FROM cloudshield.users
    WHERE email = %s;
"""

GET_USER_BY_ID = """
    SELECT id, email
    FROM cloudshield.users
    WHERE id = %s;
"""
