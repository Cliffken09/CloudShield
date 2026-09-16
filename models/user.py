from pydantic import BaseModel, EmailStr, Field


class UserRegistration(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str
