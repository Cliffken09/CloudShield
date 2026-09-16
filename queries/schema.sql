CREATE SCHEMA IF NOT EXISTS cloudshield;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE cloudshield.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cloudshield.sessions (
    token TEXT PRIMARY KEY,
    user_id UUID NOT NULL
        REFERENCES cloudshield.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id
    ON cloudshield.sessions (user_id);

CREATE TABLE cloudshield.vault_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL
        REFERENCES cloudshield.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    secret_cipher BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vault_entries_user_id
    ON cloudshield.vault_entries (user_id);
