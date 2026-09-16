import os
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

load_dotenv()

password_hasher = PasswordHasher()

_ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not _ENCRYPTION_KEY:
    raise RuntimeError(
        "ENCRYPTION_KEY environment variable is required to encrypt vault secrets"
    )
_fernet = Fernet(_ENCRYPTION_KEY.encode("utf-8"))


def hash_password(plain_password):
    return password_hasher.hash(plain_password)


def verify_password(stored_hash, plain_password):
    try:
        password_hasher.verify(stored_hash, plain_password)
        return True
    except (VerifyMismatchError, VerificationError):
        return False


def generate_session_token():
    return secrets.token_urlsafe(32)


def encrypt_secret(plain_secret):
    return _fernet.encrypt(plain_secret.encode("utf-8"))


def decrypt_secret(secret_cipher):
    try:
        return _fernet.decrypt(bytes(secret_cipher)).decode("utf-8")
    except InvalidToken:
        raise ValueError("Unable to decrypt vault secret — wrong key or corrupt data")
