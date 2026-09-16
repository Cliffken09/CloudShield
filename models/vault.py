from pydantic import BaseModel, Field


class VaultEntryCreate(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    secret: str = Field(min_length=1, max_length=1000)
