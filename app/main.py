from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def show_running():
    return {"message": "CloudShield is running"}