from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

import database
import security
from dependencies import get_current_user_id
from models.vault import VaultEntryCreate
from queries import vault as vault_queries

router = APIRouter(prefix="/vault", tags=["vault"])


@router.post("", status_code=201)
def create_vault_entry(
    entry: VaultEntryCreate, current_user_id=Depends(get_current_user_id)
):
    secret_cipher = security.encrypt_secret(entry.secret)

    created_entry = database.execute_sql_query(
        vault_queries.INSERT_VAULT_ENTRY,
        (current_user_id, entry.label, secret_cipher),
        fetch="one",
    )
    return created_entry


@router.get("")
def list_vault_entries(current_user_id=Depends(get_current_user_id)):
    return database.execute_sql_query(
        vault_queries.GET_VAULT_ENTRIES_FOR_USER,
        (current_user_id,),
        fetch="all",
    )


@router.get("/{entry_id}")
def read_vault_entry(entry_id: UUID, current_user_id=Depends(get_current_user_id)):
    entry = database.execute_sql_query(
        vault_queries.GET_VAULT_ENTRY_FOR_USER,
        (entry_id, current_user_id),
        fetch="one",
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")

    return {
        "id": entry["id"],
        "label": entry["label"],
        "secret": security.decrypt_secret(bytes(entry["secret_cipher"])),
        "created_at": entry["created_at"],
    }
