INSERT_VAULT_ENTRY = """
    INSERT INTO cloudshield.vault_entries (user_id, label, secret_cipher)
    VALUES (%s, %s, %s)
    RETURNING id, label, created_at;
"""

GET_VAULT_ENTRIES_FOR_USER = """
    SELECT id, label, created_at
    FROM cloudshield.vault_entries
    WHERE user_id = %s
    ORDER BY created_at DESC;
"""

GET_VAULT_ENTRY_FOR_USER = """
    SELECT id, label, secret_cipher, created_at
    FROM cloudshield.vault_entries
    WHERE id = %s AND user_id = %s;
"""
